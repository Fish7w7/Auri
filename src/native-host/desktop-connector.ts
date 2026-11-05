import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import type { ProtocolRequest, ProtocolResponse } from '@auri/protocol'
import { BRIDGE_SECRET_BYTES, resolveBridgeEndpointForProfile, resolveBridgeSecretPath } from '@shared/native-bridge/identity'
import { AuthenticatedPipeClient, NativeHostRequestNotSentError, NativeHostTransportError, type PipeClientTimeouts } from './pipe-client'
import type { NativeHostLog } from './host-logger'
import { assertE2EPrivateFile, loadE2EHostConfiguration } from './e2e-configuration'
import { NATIVE_HOST_PIPE_PREFIX, NATIVE_HOST_USER_DATA_DIRECTORY } from './build-mode'

export const HOST_DESKTOP_STARTUP_TIMEOUT_MS = 8_000
const RETRY_DELAYS_MS = [100, 150, 250, 400, 700, 1_000]

export interface NativeHostTransport {
  forward(request: ProtocolRequest): Promise<ProtocolResponse>
  close(): void
}

export interface DesktopConnectorOptions {
  e2eConfigPath?: string
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
  private readonly e2eOrigin?: string
  private client: AuthenticatedPipeClient | null = null
  private connecting: Promise<AuthenticatedPipeClient> | null = null
  private closed = false
  private openingClient: AuthenticatedPipeClient | null = null
  private retryWait: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null
  private spawnAttempted = false
  private readonly startupTimeoutMs: number

  constructor(private readonly options: DesktopConnectorOptions) {
    const e2e = options.e2eConfigPath ? loadE2EHostConfiguration(options.e2eConfigPath) : undefined
    this.e2eOrigin = e2e?.origin
    this.userDataPath = e2e?.userDataPath ?? join(options.appDataPath, NATIVE_HOST_USER_DATA_DIRECTORY)
    this.endpoint = e2e?.endpoint ?? resolveBridgeEndpointForProfile(this.userDataPath, NATIVE_HOST_PIPE_PREFIX)
    this.secretPath = resolveBridgeSecretPath(this.userDataPath)
    this.startupTimeoutMs = options.startupTimeoutMs ?? HOST_DESKTOP_STARTUP_TIMEOUT_MS
  }

  async forward(request: ProtocolRequest): Promise<ProtocolResponse> {
    this.validateE2EProfile()
    const client = await this.ensureClient()
    try { return await client.forward(request) }
    catch (error) {
      this.discardClient(client)
      if (!(error instanceof NativeHostRequestNotSentError) || this.closed) throw error
      // A preflight race proved no frame reached write. This is its first transmission, not a replay.
      const fresh = await this.ensureClient()
      try { return await fresh.forward(request) }
      catch (nextError) { this.discardClient(fresh); throw nextError }
    }
  }

  close(): void {
    this.closed = true
    this.client?.close()
    this.openingClient?.close()
    this.client = null
    this.openingClient = null
    if (this.retryWait) { clearTimeout(this.retryWait.timer); this.retryWait.resolve(); this.retryWait = null }
  }

  private discardClient(client: AuthenticatedPipeClient): void {
    if (this.client === client) this.client = null
    client.close()
  }

  private ensureClient(): Promise<AuthenticatedPipeClient> {
    if (this.closed) return Promise.reject(new NativeHostTransportError('O Native Host foi encerrado.'))
    if (this.client?.isUsable) return Promise.resolve(this.client)
    if (this.client) this.discardClient(this.client)
    if (!this.connecting) {
      const connecting = this.connectWithStartup().then((client) => {
        if (this.closed || !client.isUsable) { client.close(); throw new NativeHostTransportError('A conexão com o Auri foi encerrada.') }
        this.client = client
        return client
      }).finally(() => { if (this.connecting === connecting) this.connecting = null })
      this.connecting = connecting
    }
    return this.connecting
  }

  private async connectWithStartup(): Promise<AuthenticatedPipeClient> {
    const started = Date.now()
    let lastError: unknown
    while (!this.closed && Date.now() - started < this.startupTimeoutMs) {
      try { return await this.createClient() }
      catch (error) { lastError = error }

      if (this.closed || this.options.e2eConfigPath || this.options.development) break
      if (!this.spawnAttempted) {
        this.spawnAttempted = true
        const executable = resolveInstalledAuriExecutable(this.options.hostExecutable)
        if (!executable) throw new NativeHostTransportError('A instalação do Auri não foi encontrada.')
        ;(this.options.startDesktop ?? startInstalledDesktop)(executable)
        this.options.logger.info('Inicialização oculta do Desktop solicitada.', { event: 'native_host.desktop_start_requested' })
      }
      const elapsed = Date.now() - started
      const delay = RETRY_DELAYS_MS[Math.min(Math.floor(elapsed / 750), RETRY_DELAYS_MS.length - 1)]
      await this.waitForRetry(Math.min(delay, Math.max(0, this.startupTimeoutMs - elapsed)))
    }
    throw lastError instanceof NativeHostTransportError ? lastError : new NativeHostTransportError('O Auri não ficou pronto a tempo.')
  }

  private validateE2EProfile(): void {
    if (!this.options.e2eConfigPath) return
    try {
      const current = loadE2EHostConfiguration(this.options.e2eConfigPath)
      if (current.userDataPath !== this.userDataPath || current.endpoint !== this.endpoint || current.origin !== this.e2eOrigin) throw new Error('E2E profile changed')
      assertE2EPrivateFile(this.secretPath)
    } catch {
      this.close()
      throw new NativeHostTransportError('O perfil E2E ou sua identidade local não está disponível.')
    }
  }

  private async createClient(): Promise<AuthenticatedPipeClient> {
    this.validateE2EProfile()
    const secret = readBridgeSecret(this.secretPath)
    const defaults: PipeClientTimeouts = { connectMs: 500, handshakeMs: 1_000, requestMs: 15_000 }
    if (this.closed) throw new NativeHostTransportError('O Native Host foi encerrado.')
    const client = new AuthenticatedPipeClient(this.endpoint, secret, { ...defaults, ...this.options.pipeTimeouts }, (closedClient) => {
      if (this.client === closedClient) this.client = null
      if (this.openingClient === closedClient) this.openingClient = null
    })
    this.openingClient = client
    let opened: AuthenticatedPipeClient
    try { opened = await client.open() }
    catch (error) { client.close(); throw error }
    finally { if (this.openingClient === client) this.openingClient = null }
    this.options.logger.info('Conexão autenticada com o Desktop.', { event: 'native_host.pipe_connected' })
    return opened
  }

  private waitForRetry(milliseconds: number): Promise<void> {
    if (this.closed) return Promise.resolve()
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (this.retryWait?.timer === timer) this.retryWait = null; resolve() }, milliseconds)
      this.retryWait = { timer, resolve }
    })
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
