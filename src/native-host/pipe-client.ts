import { randomBytes } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import {
  safeParseResponse,
  type ProtocolRequest,
  type ProtocolResponse
} from '@auri/protocol'
import { createBridgeProof } from '@shared/native-bridge/authentication'
import { BRIDGE_HANDSHAKE_TIMEOUT_MS, BRIDGE_REQUEST_TIMEOUT_MS } from '@shared/native-bridge/constants'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'

export class NativeHostTransportError extends Error {}

interface PendingRequest {
  resolve: (response: ProtocolResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface PipeClientTimeouts {
  connectMs: number
  handshakeMs: number
  requestMs: number
}

const DEFAULT_TIMEOUTS: PipeClientTimeouts = {
  connectMs: 1_000,
  handshakeMs: BRIDGE_HANDSHAKE_TIMEOUT_MS,
  requestMs: BRIDGE_REQUEST_TIMEOUT_MS
}

export class AuthenticatedPipeClient {
  private socket: Socket | null = null
  private readonly decoder = new LengthPrefixedJsonDecoder()
  private readonly pending = new Map<string, PendingRequest>()
  private authenticated = false
  private serverNonce: string | null = null
  private handshakeResolve: (() => void) | null = null
  private handshakeReject: ((error: Error) => void) | null = null

  constructor(
    private readonly endpoint: string,
    private readonly secret: Buffer,
    private readonly timeouts: PipeClientTimeouts = DEFAULT_TIMEOUTS
  ) {}

  async open(): Promise<this> {
    if (this.socket) throw new NativeHostTransportError('O cliente do pipe já foi iniciado.')
    const socket = connect(this.endpoint)
    this.socket = socket
    socket.on('data', (chunk) => this.onData(chunk))
    socket.on('error', (error) => this.fail(new NativeHostTransportError(`Falha no pipe: ${error.name}.`)))
    socket.on('close', () => this.fail(new NativeHostTransportError('A conexão com o Auri foi encerrada.')))

    await new Promise<void>((resolve, reject) => {
      let connected = false
      const connectTimer = setTimeout(() => {
        if (!connected) {
          socket.destroy()
          reject(new NativeHostTransportError('Tempo esgotado ao conectar ao Auri.'))
        }
      }, this.timeouts.connectMs)
      socket.once('connect', () => {
        connected = true
        clearTimeout(connectTimer)
        resolve()
      })
      socket.once('error', () => {
        clearTimeout(connectTimer)
        if (!connected) reject(new NativeHostTransportError('O pipe do Auri não está disponível.'))
      })
    })

    await new Promise<void>((resolve, reject) => {
      this.handshakeResolve = resolve
      this.handshakeReject = reject
      const timer = setTimeout(() => reject(new NativeHostTransportError('Tempo esgotado na autenticação local.')), this.timeouts.handshakeMs)
      const finishResolve = resolve
      const finishReject = reject
      this.handshakeResolve = () => { clearTimeout(timer); finishResolve() }
      this.handshakeReject = (error) => { clearTimeout(timer); finishReject(error) }
    }).catch((error) => {
      this.close()
      throw error
    })
    return this
  }

  forward(request: ProtocolRequest): Promise<ProtocolResponse> {
    if (!this.authenticated || !this.socket || this.socket.destroyed) {
      return Promise.reject(new NativeHostTransportError('O Auri não está pronto.'))
    }
    const key = requestKey(request.id, request.method)
    if (this.pending.has(key)) return Promise.reject(new NativeHostTransportError('Já existe uma solicitação com este identificador.'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key)
        reject(new NativeHostTransportError('Tempo esgotado aguardando o Auri.'))
      }, this.timeouts.requestMs)
      this.pending.set(key, { resolve, reject, timer })
      this.socket!.write(encodeLengthPrefixedJson(request), (error) => {
        if (!error) return
        const pending = this.pending.get(key)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(key)
        pending.reject(new NativeHostTransportError('Não foi possível enviar a solicitação ao Auri.'))
      })
    })
  }

  close(): void {
    const socket = this.socket
    this.socket = null
    this.authenticated = false
    socket?.destroy()
    this.fail(new NativeHostTransportError('O Native Host foi encerrado.'))
  }

  private onData(chunk: Buffer): void {
    try {
      for (const message of this.decoder.push(chunk)) this.onMessage(message)
    } catch {
      this.fail(new NativeHostTransportError('O Auri enviou um frame inválido.'))
      this.socket?.destroy()
    }
  }

  private onMessage(message: unknown): void {
    if (!this.serverNonce) {
      if (!isChallenge(message)) throw new NativeHostTransportError('Desafio de autenticação inválido.')
      this.serverNonce = message.nonce
      const clientNonce = randomBytes(32).toString('base64')
      this.socket?.write(encodeLengthPrefixedJson({
        type: 'authenticate', clientNonce,
        proof: createBridgeProof(this.secret, message.nonce, clientNonce)
      }))
      return
    }
    if (!this.authenticated) {
      if (!isAuthenticated(message)) {
        this.handshakeReject?.(new NativeHostTransportError('Autenticação local recusada.'))
        this.handshakeReject = null
        this.handshakeResolve = null
        this.socket?.destroy()
        return
      }
      this.authenticated = true
      this.handshakeResolve?.()
      this.handshakeReject = null
      this.handshakeResolve = null
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

  private fail(error: NativeHostTransportError): void {
    this.handshakeReject?.(error)
    this.handshakeReject = null
    this.handshakeResolve = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function requestKey(id: string, method: string): string { return `${id}\0${method}` }

function isChallenge(value: unknown): value is { type: 'challenge'; nonce: string } {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).type === 'challenge' && typeof (value as Record<string, unknown>).nonce === 'string')
}

function isAuthenticated(value: unknown): value is { type: 'authenticated' } {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>).type === 'authenticated')
}

