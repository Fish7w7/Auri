import { randomBytes } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import { safeParseResponse, type ProtocolRequest, type ProtocolResponse } from '@auri/protocol'
import { createBridgeProof } from '@shared/native-bridge/authentication'
import { BRIDGE_HANDSHAKE_TIMEOUT_MS, BRIDGE_REQUEST_TIMEOUT_MS } from '@shared/native-bridge/constants'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'

export class NativeHostTransportError extends Error {}
/** Only raised before socket.write is invoked for this request. */
export class NativeHostRequestNotSentError extends NativeHostTransportError {}
interface PendingRequest { resolve: (response: ProtocolResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
export interface PipeClientTimeouts { connectMs: number; handshakeMs: number; requestMs: number }
const DEFAULT_TIMEOUTS: PipeClientTimeouts = { connectMs: 1_000, handshakeMs: BRIDGE_HANDSHAKE_TIMEOUT_MS, requestMs: BRIDGE_REQUEST_TIMEOUT_MS }

export class AuthenticatedPipeClient {
  private socket: Socket | null = null
  private readonly decoder = new LengthPrefixedJsonDecoder()
  private readonly pending = new Map<string, PendingRequest>()
  private authenticated = false
  private started = false
  private closed = false
  private serverNonce: string | null = null
  private openResolve: (() => void) | null = null
  private openReject: ((error: Error) => void) | null = null
  private connectTimer?: ReturnType<typeof setTimeout>
  private handshakeTimer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly endpoint: string,
    private readonly secret: Buffer,
    private readonly timeouts: PipeClientTimeouts = DEFAULT_TIMEOUTS,
    private readonly onClosed?: (client: AuthenticatedPipeClient) => void
  ) {}

  get isUsable(): boolean {
    return !this.closed && this.authenticated && this.socket !== null && !this.socket.destroyed && this.socket.writable && !this.socket.writableEnded
  }

  async open(): Promise<this> {
    if (this.started || this.closed) throw new NativeHostTransportError('O cliente do pipe não pode ser reiniciado.')
    this.started = true
    await new Promise<void>((resolve, reject) => {
      // Install settlement before opening: close/error must also reject an unfinished handshake.
      this.openResolve = resolve
      this.openReject = reject
      this.connectTimer = setTimeout(() => this.terminate(new NativeHostTransportError('Tempo esgotado ao conectar ao Auri.')), this.timeouts.connectMs)
      const socket = connect(this.endpoint)
      this.socket = socket
      socket.once('connect', () => {
        clearTimeout(this.connectTimer)
        this.connectTimer = undefined
        if (!this.closed) this.handshakeTimer = setTimeout(() => this.terminate(new NativeHostTransportError('Tempo esgotado na autenticação local.')), this.timeouts.handshakeMs)
      })
      socket.on('data', (chunk) => this.onData(chunk))
      socket.on('error', (error) => this.terminate(new NativeHostTransportError('Falha no pipe: ' + error.name + '.')))
      socket.on('end', () => this.terminate(new NativeHostTransportError('A conexão com o Auri foi encerrada.')))
      socket.on('close', () => this.terminate(new NativeHostTransportError('A conexão com o Auri foi encerrada.')))
    }).catch((error) => { this.terminate(error); throw error })
    if (!this.isUsable) throw new NativeHostTransportError('A conexão com o Auri foi encerrada.')
    return this
  }

  forward(request: ProtocolRequest): Promise<ProtocolResponse> {
    const frame = encodeLengthPrefixedJson(request)
    if (!this.isUsable) return Promise.reject(new NativeHostRequestNotSentError('O pipe foi encerrado antes do envio.'))
    const socket = this.socket!
    const key = requestKey(request.id, request.method)
    if (this.pending.has(key)) return Promise.reject(new NativeHostTransportError('Já existe uma solicitação com este identificador.'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.terminate(new NativeHostTransportError('Tempo esgotado aguardando o Auri.')), this.timeouts.requestMs)
      this.pending.set(key, { resolve, reject, timer })
      // From this point delivery is potentially performed, even if write throws or its callback fails.
      try {
        socket.write(frame, (error) => {
          if (error) this.terminate(new NativeHostTransportError('Não foi possível enviar a solicitação ao Auri.'))
        })
      } catch {
        this.terminate(new NativeHostTransportError('Não foi possível enviar a solicitação ao Auri.'))
      }
    })
  }

  close(): void { this.terminate(new NativeHostTransportError('O Native Host foi encerrado.')) }

  private onData(chunk: Buffer): void {
    if (this.closed) return
    try { for (const message of this.decoder.push(chunk)) this.onMessage(message) }
    catch { this.terminate(new NativeHostTransportError('O Auri enviou um frame inválido.')) }
  }

  private onMessage(message: unknown): void {
    if (!this.serverNonce) {
      if (!isChallenge(message)) throw new NativeHostTransportError('Desafio de autenticação inválido.')
      this.serverNonce = message.nonce
      const clientNonce = randomBytes(32).toString('base64')
      this.socket?.write(encodeLengthPrefixedJson({ type: 'authenticate', clientNonce, proof: createBridgeProof(this.secret, message.nonce, clientNonce) }))
      return
    }
    if (!this.authenticated) {
      if (!isAuthenticated(message)) { this.terminate(new NativeHostTransportError('Autenticação local recusada.')); return }
      this.authenticated = true
      clearTimeout(this.handshakeTimer)
      this.handshakeTimer = undefined
      const resolve = this.openResolve
      this.openResolve = null
      this.openReject = null
      resolve?.()
      return
    }
    const parsed = safeParseResponse(message)
    if (!parsed.success) throw new NativeHostTransportError('Resposta inválida recebida do Auri.')
    const response = parsed.data
    const key = requestKey(response.id, response.method)
    const pending = this.pending.get(key)
    if (!pending) throw new NativeHostTransportError('Resposta sem solicitação correspondente.')
    clearTimeout(pending.timer)
    this.pending.delete(key)
    pending.resolve(response)
  }

  private terminate(error: NativeHostTransportError): void {
    if (this.closed) return
    this.closed = true
    this.authenticated = false
    clearTimeout(this.connectTimer)
    clearTimeout(this.handshakeTimer)
    this.connectTimer = undefined
    this.handshakeTimer = undefined
    const reject = this.openReject
    this.openReject = null
    this.openResolve = null
    reject?.(error)
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error) }
    this.pending.clear()
    const socket = this.socket
    this.socket = null
    socket?.destroy()
    this.onClosed?.(this)
  }
}

function requestKey(id: string, method: string): string { return `${id}\0${method}` }

function isChallenge(value: unknown): value is { type: 'challenge'; nonce: string } {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).type === 'challenge' && typeof (value as Record<string, unknown>).nonce === 'string')
}

function isAuthenticated(value: unknown): value is { type: 'authenticated' } {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).type === 'authenticated')
}

