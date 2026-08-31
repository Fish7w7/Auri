import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import type { ProtocolRequest, ProtocolResponse } from '@auri/protocol'
import { BRIDGE_SECRET_BYTES, resolveBridgeEndpoint, resolveBridgeSecretPath, resolveBridgeUserData } from '@shared/native-bridge/identity'
import { AuthenticatedPipeClient, NativeHostTransportError, type PipeClientTimeouts } from './pipe-client'
import type { NativeHostLog } from './host-logger'

export const HOST_DESKTOP_STARTUP_TIMEOUT_MS = 8_000
const RETRY_DELAYS_MS = [100, 150, 250, 400, 700, 1_000]

export interface NativeHostTransport {
  forward(request: ProtocolRequest): Promise<ProtocolResponse>
  close(): void
}

export interface DesktopConnectorOptions {
  development: boolean
  appDataPath: string
  hostExecutable: string
  logger: NativeHostLog
  startupTimeoutMs?: number
  pipeTimeouts?: Partial<PipeClientTimeouts>
  startDesktop?: (executable: string) => void
}

export class DesktopConnector implements NativeHostTransport {
  readonly userDataPath: string
  readonly endpoint: string
  readonly secretPath: string
  private client: AuthenticatedPipeClient | null = null
  private connecting: Promise<AuthenticatedPipeClient> | null = null
  private spawnAttempted = false
  private readonly startupTimeoutMs: number

  constructor(private readonly options: DesktopConnectorOptions) {
    this.userDataPath = resolveBridgeUserData(options.appDataPath, options.development)
    this.endpoint = resolveBridgeEndpoint(this.userDataPath, options.development)
    this.secretPath = resolveBridgeSecretPath(this.userDataPath)
    this.startupTimeoutMs = options.startupTimeoutMs ?? HOST_DESKTOP_STARTUP_TIMEOUT_MS
  }

  async forward(request: ProtocolRequest): Promise<ProtocolResponse> {
    const client = await this.ensureClient()
    try { return await client.forward(request) }
    catch (error) {
      if (this.client === client) this.client = null
      client.close()
      throw error
    }
  }

  close(): void {
    this.client?.close()
    this.client = null
  }

  private ensureClient(): Promise<AuthenticatedPipeClient> {
    if (this.client) return Promise.resolve(this.client)
    if (!this.connecting) {
      this.connecting = this.connectWithStartup().then((client) => {
        this.client = client
        return client
      }).finally(() => { this.connecting = null })
    }
    return this.connecting
  }

  private async connectWithStartup(): Promise<AuthenticatedPipeClient> {
    const started = Date.now()
    let lastError: unknown
    while (Date.now() - started < this.startupTimeoutMs) {
      try { return await this.createClient() }
      catch (error) { lastError = error }

      if (this.options.development) break
      if (!this.spawnAttempted) {
        this.spawnAttempted = true
        const executable = resolveInstalledAuriExecutable(this.options.hostExecutable)
        if (!executable) throw new NativeHostTransportError('A instalação do Auri não foi encontrada.')
        ;(this.options.startDesktop ?? startInstalledDesktop)(executable)
        this.options.logger.info('Inicialização oculta do Desktop solicitada.', { event: 'native_host.desktop_start_requested' })
      }
      const elapsed = Date.now() - started
      const delay = RETRY_DELAYS_MS[Math.min(Math.floor(elapsed / 750), RETRY_DELAYS_MS.length - 1)]
      await sleep(Math.min(delay, Math.max(0, this.startupTimeoutMs - elapsed)))
    }
    throw lastError instanceof NativeHostTransportError ? lastError : new NativeHostTransportError('O Auri não ficou pronto a tempo.')
  }

  private async createClient(): Promise<AuthenticatedPipeClient> {
    const secret = readBridgeSecret(this.secretPath)
    const defaults: PipeClientTimeouts = { connectMs: 500, handshakeMs: 1_000, requestMs: 15_000 }
    const client = new AuthenticatedPipeClient(this.endpoint, secret, { ...defaults, ...this.options.pipeTimeouts })
    const opened = await client.open()
    this.options.logger.info('Conexão autenticada com o Desktop.', { event: 'native_host.pipe_connected' })
    return opened
  }
}

export function readBridgeSecret(secretPath: string): Buffer {
  let secret: Buffer
  try { secret = Buffer.from(readFileSync(secretPath, 'utf8').trim(), 'base64') }
  catch { throw new NativeHostTransportError('A identidade local do Auri não está disponível.') }
  if (secret.length !== BRIDGE_SECRET_BYTES) throw new NativeHostTransportError('A identidade local do Auri é inválida.')
  return secret
}

export function resolveInstalledAuriExecutable(hostExecutable: string): string | null {
  const hostDirectory = dirname(resolve(hostExecutable))
  const candidates = [
    join(hostDirectory, 'Auri.exe'),
    join(hostDirectory, '..', 'Auri.exe'),
    join(hostDirectory, '..', '..', 'Auri.exe')
  ]
  return candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate)) ?? null
}

function startInstalledDesktop(executable: string): void {
  const child = spawn(executable, ['--native-bridge-start'], {
    detached: true, stdio: 'ignore', windowsHide: true
  })
  child.unref()
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
