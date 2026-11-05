import type { Readable, Writable } from 'node:stream'
import {
  PROTOCOL_METHOD,
  PROTOCOL_METHODS,
  createErrorResponse,
  safeParseRequest,
  safeParseResponse,
  type ProtocolMethod,
  type ProtocolRequest,
  type ProtocolResponse
} from '@auri/protocol'
import { encodeLengthPrefixedJson, LengthPrefixedFrameError, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import type { NativeHostLog } from './host-logger'
import type { NativeHostTransport } from './desktop-connector'

export class NativeMessagingRuntime {
  private readonly decoder = new LengthPrefixedJsonDecoder()
  private closed = false
  private started = false

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly transport: NativeHostTransport,
    private readonly logger: NativeHostLog
  ) {}

  start(): void {
    if (this.started || this.closed) return
    this.started = true
    releaseClosedStreamGuard(this.input)
    releaseClosedStreamGuard(this.output)
    this.output.on('error', this.onOutputError)
    this.input.on('data', this.onData)
    this.input.once('end', this.onEnd)
    this.input.once('error', this.onInputError)
    this.input.resume()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.input.removeListener('data', this.onData)
    this.input.removeListener('end', this.onEnd)
    this.input.removeListener('error', this.onInputError)
    this.output.removeListener('error', this.onOutputError)
    // Do not destroy/end streams owned by the caller or pause another consumer.
    if (this.input.listenerCount('data') === 0) this.input.pause()
    guardClosedStream(this.input)
    guardClosedStream(this.output)
    this.transport.close()
  }

  private readonly onOutputError = (): void => { this.close() }

  private readonly onData = (chunk: Buffer): void => {
    if (this.closed) return
    try {
      for (const message of this.decoder.push(chunk)) void this.process(message)
    } catch (error) {
      this.logger.error('Frame do Native Messaging recusado.', {
        event: 'native_host.frame_rejected',
        errorCode: error instanceof LengthPrefixedFrameError ? 'INVALID_FRAME' : 'UNKNOWN'
      })
      this.close()
    }
  }

  private readonly onEnd = (): void => {
    this.logger.info('Entrada do navegador encerrada.', {
      event: 'native_host.stdin_closed',
      ...(this.decoder.hasPartialFrame ? { errorCode: 'PARTIAL_FRAME' } : {})
    })
    this.close()
  }

  private readonly onInputError = (): void => {
    this.logger.error('Falha na entrada do navegador.', { event: 'native_host.stdin_failed', errorCode: 'INPUT_ERROR' })
    this.close()
  }

  private async process(input: unknown): Promise<void> {
    const parsed = safeParseRequest(input)
    if (!parsed.success) {
      this.writeResponse(invalidRequestResponse(input))
      return
    }
    const request = parsed.data
    const started = Date.now()
    try {
      const response = await this.transport.forward(request)
      const validated = safeParseResponse(response)
      if (!validated.success || validated.data.id !== request.id || validated.data.method !== request.method) {
        throw new Error('Resposta do Desktop não corresponde à solicitação.')
      }
      this.writeResponse(validated.data)
      this.logger.info('Solicitação encaminhada ao Desktop.', {
        event: 'native_host.request_completed', method: request.method,
        requestId: request.id, durationMs: Date.now() - started
      })
    } catch (error) {
      this.writeResponse(createErrorResponse(request.id, request.method, {
        code: 'AURI_NOT_READY', message: 'O Auri não está pronto para receber esta solicitação.'
      }) as ProtocolResponse)
      this.logger.warn('Solicitação não pôde ser encaminhada.', {
        event: 'native_host.request_failed', method: request.method,
        requestId: request.id, durationMs: Date.now() - started,
        errorCode: error instanceof Error ? error.name : 'UNKNOWN'
      })
    }
  }

  private writeResponse(response: ProtocolResponse): void {
    if (this.closed) return
    this.output.write(encodeLengthPrefixedJson(response))
  }
}

function invalidRequestResponse(input: unknown): ProtocolResponse {
  const envelope = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const id = typeof envelope.id === 'string' && envelope.id.trim() ? envelope.id.slice(0, 128) : 'invalid-request'
  const knownMethod = PROTOCOL_METHODS.includes(envelope.method as ProtocolMethod)
  const method = knownMethod ? envelope.method as ProtocolMethod : PROTOCOL_METHOD.systemHello
  const code = envelope.protocolVersion !== undefined && envelope.protocolVersion !== 1
    ? 'UNSUPPORTED_PROTOCOL_VERSION'
    : typeof envelope.method === 'string' && !knownMethod ? 'METHOD_NOT_SUPPORTED' : 'INVALID_PARAMS'
  const message = code === 'INVALID_PARAMS' ? 'Parâmetros inválidos.' : code === 'METHOD_NOT_SUPPORTED' ? 'Método não suportado.' : 'Versão do protocolo não suportada.'
  return createErrorResponse(id, method, { code, message }) as ProtocolResponse
}

export type { ProtocolRequest }


// A queued stream error still needs a listener after runtime handlers are detached.
// Shared, bounded until close, and never captures a NativeMessagingRuntime instance.
const closedStreamGuards = new WeakMap<Readable | Writable, () => void>()
const ignoreClosedStreamError = (): void => undefined
function releaseClosedStreamGuard(stream: Readable | Writable): void { closedStreamGuards.get(stream)?.() }
function guardClosedStream(stream: Readable | Writable): void {
  if (stream.closed || stream.listenerCount('error') !== 0) return
  const release = (): void => {
    stream.removeListener('error', ignoreClosedStreamError)
    stream.removeListener('close', release)
    closedStreamGuards.delete(stream)
  }
  closedStreamGuards.set(stream, release)
  stream.on('error', ignoreClosedStreamError)
  stream.once('close', release)
}
