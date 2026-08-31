import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import type { ProtocolDispatcher } from '../protocol/protocol-dispatcher'
import type { Logger } from '../logging/logger'
import { BridgeFrameDecoder, BridgeFrameError, encodeBridgeFrame } from './bridge-framing'

export const BRIDGE_HANDSHAKE_TIMEOUT_MS = 5_000
export const BRIDGE_REQUEST_TIMEOUT_MS = 15_000
export const BRIDGE_IDLE_TIMEOUT_MS = 60_000
const HMAC_CONTEXT = 'auri-bridge-v1'
export interface BridgeTimeouts { handshakeMs: number; requestMs: number; idleMs: number }

export function createBridgeProof(secret: Buffer, serverNonce: string, clientNonce: string): string {
  return createHmac('sha256', secret).update(`${HMAC_CONTEXT}:${serverNonce}:${clientNonce}`).digest('base64')
}

export class NamedPipeBridgeServer {
  private server: Server | null = null
  private readonly sockets = new Set<Socket>()

  constructor(
    private readonly endpoint: string,
    private readonly secret: Buffer,
    private readonly dispatcher: ProtocolDispatcher,
    private readonly logger: Logger,
    private readonly timeouts: BridgeTimeouts = { handshakeMs: BRIDGE_HANDSHAKE_TIMEOUT_MS, requestMs: BRIDGE_REQUEST_TIMEOUT_MS, idleMs: BRIDGE_IDLE_TIMEOUT_MS }
  ) {}

  start(): Promise<void> {
    if (this.server) return Promise.resolve()
    this.server = createServer((socket) => this.accept(socket))
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(this.endpoint, () => {
        this.server!.removeListener('error', reject)
        this.server!.on('error', (error) => this.logger.error('bridge', 'Falha no servidor local.', { event: 'bridge.server_error', errorCode: error.name }))
        this.logger.info('bridge', 'Desktop Bridge iniciado.', { event: 'bridge.server_started' })
        resolve()
      })
    })
  }

  close(): void {
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    this.server?.close()
    this.server = null
    this.logger.info('bridge', 'Desktop Bridge encerrado.', { event: 'bridge.server_stopped' })
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket)
    const decoder = new BridgeFrameDecoder()
    const serverNonce = randomBytes(32).toString('base64')
    let authenticated = false
    let processing = Promise.resolve()
    const handshakeTimer = setTimeout(() => socket.destroy(), this.timeouts.handshakeMs)
    socket.setTimeout(this.timeouts.idleMs, () => socket.destroy())
    socket.write(encodeBridgeFrame({ type: 'challenge', nonce: serverNonce }))
    this.logger.info('bridge', 'Cliente local conectado.', { event: 'bridge.connection_opened' })

    socket.on('data', (chunk) => {
      try {
        for (const message of decoder.push(chunk)) processing = processing.then(() => this.process(socket, message, serverNonce, () => { authenticated = true; clearTimeout(handshakeTimer) }, () => authenticated))
      } catch (error) {
        this.logger.warn('bridge', 'Conexão rejeitada por framing inválido.', { event: 'bridge.frame_rejected', errorCode: error instanceof BridgeFrameError ? 'INVALID_FRAME' : 'UNKNOWN' })
        socket.destroy()
      }
    })
    socket.on('close', () => { clearTimeout(handshakeTimer); this.sockets.delete(socket); this.logger.info('bridge', 'Cliente local desconectado.', { event: 'bridge.connection_closed', partialFrame: decoder.hasPartialFrame }) })
    socket.on('error', () => undefined)
  }

  private async process(socket: Socket, message: unknown, serverNonce: string, authenticate: () => void, isAuthenticated: () => boolean): Promise<void> {
    if (!isAuthenticated()) {
      if (!this.verifyAuthentication(message, serverNonce)) {
        this.logger.warn('bridge', 'Autenticação local recusada.', { event: 'bridge.authentication_failed' })
        socket.end(encodeBridgeFrame({ type: 'authentication_error' }))
        return
      }
      authenticate()
      socket.write(encodeBridgeFrame({ type: 'authenticated' }))
      this.logger.info('bridge', 'Cliente local autenticado.', { event: 'bridge.authentication_succeeded' })
      return
    }
    let requestTimer: ReturnType<typeof setTimeout> | undefined
    const response = await Promise.race([
      this.dispatcher.dispatch(message),
      new Promise<never>((_, reject) => { requestTimer = setTimeout(() => reject(new Error('request timeout')), this.timeouts.requestMs) })
    ]).catch(() => null).finally(() => clearTimeout(requestTimer))
    if (response) socket.write(encodeBridgeFrame(response))
    else socket.destroy()
  }

  private verifyAuthentication(message: unknown, serverNonce: string): boolean {
    if (!message || typeof message !== 'object') return false
    const value = message as Record<string, unknown>
    if (value.type !== 'authenticate' || typeof value.clientNonce !== 'string' || typeof value.proof !== 'string') return false
    const expected = Buffer.from(createBridgeProof(this.secret, serverNonce, value.clientNonce), 'base64')
    let received: Buffer
    try { received = Buffer.from(value.proof, 'base64') } catch { return false }
    return expected.length === received.length && timingSafeEqual(expected, received)
  }
}
