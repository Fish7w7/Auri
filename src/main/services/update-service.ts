import electronUpdater from 'electron-updater'
import type { UpdateState } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import type { Logger } from '../logging/logger'
import type { CriticalOperationCoordinator } from './critical-operation-coordinator'
import { withAbsoluteDeadline } from './external-request-deadline'

export const UPDATE_CHECK_TIMEOUT_MS = 45_000

interface UpdateInfoLike {
  version: string
  releaseNotes?: string | Array<{ version?: string; note: string | null }> | null
}

interface ProgressLike { percent: number }

export interface UpdaterAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  channel: string | null
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: UpdateInfoLike) => void): unknown
  on(event: 'download-progress', listener: (progress: ProgressLike) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  dispose?(): void
}

export interface UpdateServiceOptions {
  currentVersion: string
  isPackaged: boolean
  isConfigured: boolean
  isDevelopmentMock?: boolean
  criticalOperations: CriticalOperationCoordinator
  updater?: UpdaterAdapter
  checkTimeoutMs?: number
}

export class UpdateService {
  private readonly updater: UpdaterAdapter
  private readonly dirtyScopes = new Set<string>()
  private state: UpdateState
  private pendingCheck: Promise<unknown> | null = null
  private ignorePendingCheckEvents = false
  private checkSequence = 0

  constructor(private readonly logger: Logger, private readonly options: UpdateServiceOptions) {
    this.updater = options.updater ?? (electronUpdater.autoUpdater as unknown as UpdaterAdapter)
    const isDevelopmentMock = options.isDevelopmentMock === true && !options.isPackaged
    const availability = isDevelopmentMock || options.isConfigured ? 'ready' : options.isPackaged ? 'not_configured' : 'development'
    this.state = { status: availability === 'ready' ? 'idle' : 'unavailable', currentVersion: options.currentVersion, availableVersion: null, progressPercent: null, releaseNotes: null, errorMessage: null, errorContext: null, lastCheckedAt: null, isDevelopmentMock, availability }
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.registerEvents()
  }

  configure(channel: 'stable'): void {
    this.updater.channel = 'latest'
    this.logger.info('updater', 'Canal de atualização configurado.', { event: 'updater.configured', channel })
  }

  getState(): UpdateState { return { ...this.state } }

  get isDevelopmentMock(): boolean { return this.state.isDevelopmentMock }

  dispose(): void { this.updater.dispose?.() }

  async checkForUpdates(): Promise<UpdateState> {
    if (this.state.availability !== 'ready') return this.getState()
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.getState()
    const sequence = ++this.checkSequence
    this.patch({ status: 'checking', errorMessage: null, errorContext: null, progressPercent: null })
    try {
      if (this.pendingCheck) {
        try { await this.pendingCheck } catch { /* a tentativa expirada já foi reportada */ }
        if (sequence !== this.checkSequence) return this.getState()
      }
      this.ignorePendingCheckEvents = false
      const check = this.updater.checkForUpdates()
      this.pendingCheck = check
      void check.finally(() => {
        if (this.pendingCheck === check) {
          this.pendingCheck = null
          this.ignorePendingCheckEvents = false
        }
      }).catch(() => undefined)
      await withAbsoluteDeadline(
        check,
        Date.now() + (this.options.checkTimeoutMs ?? UPDATE_CHECK_TIMEOUT_MS),
        () => new DomainError('UPDATE_CHECK_FAILED', 'A verificação de atualizações demorou demais.', { timeout: true })
      )
      const status = this.getState().status
      this.patch({
        ...(status === 'checking' ? { status: 'up_to_date' as const } : {}),
        lastCheckedAt: new Date().toISOString()
      })
      return this.getState()
    } catch (error) {
      const timedOut = error instanceof DomainError && error.details?.timeout === true
      if (timedOut && this.pendingCheck) this.ignorePendingCheckEvents = true
      const message = timedOut ? 'A verificação demorou demais. Tente novamente.' : 'Não foi possível verificar atualizações.'
      this.fail(message, 'updater.check_failed', error, 'check')
      throw new DomainError('UPDATE_CHECK_FAILED', message)
    }
  }

  async downloadUpdate(): Promise<UpdateState> {
    const canRetryDownload = this.state.status === 'error' && this.state.errorContext === 'download' && Boolean(this.state.availableVersion)
    if (this.state.status !== 'available' && !canRetryDownload) throw new DomainError('UPDATE_DOWNLOAD_FAILED', 'Nenhuma atualização está disponível para download.')
    this.patch({ status: 'downloading', progressPercent: 0, errorMessage: null, errorContext: null })
    try {
      await this.updater.downloadUpdate()
      return this.getState()
    } catch (error) {
      this.fail('Não foi possível baixar a atualização.', 'updater.download_failed', error, 'download')
      throw new DomainError('UPDATE_DOWNLOAD_FAILED', 'Não foi possível baixar a atualização agora.')
    }
  }

  installUpdate(): void {
    if (this.state.status !== 'ready') throw new DomainError('UPDATE_INSTALL_BLOCKED', 'A atualização ainda não está pronta para instalar.')
    const operation = this.options.criticalOperations.current
    if (operation) throw new DomainError('UPDATE_INSTALL_BLOCKED', 'A instalação será liberada quando a operação crítica terminar.', { operation })
    if (this.dirtyScopes.size) throw new DomainError('UPDATE_INSTALL_BLOCKED', 'Salve ou descarte as alterações não salvas antes de atualizar.')
    this.logger.info('updater', 'Reiniciando para instalar atualização.', { event: 'updater.install_started', version: this.state.availableVersion })
    this.updater.quitAndInstall(false, true)
  }

  setDirty(input: unknown): void {
    const request = input as { scope?: unknown; dirty?: unknown }
    if (typeof request.scope !== 'string' || !request.scope.trim() || typeof request.dirty !== 'boolean') throw new DomainError('INVALID_INPUT', 'Estado de edição inválido.')
    if (request.dirty) this.dirtyScopes.add(request.scope)
    else this.dirtyScopes.delete(request.scope)
  }

  private registerEvents(): void {
    this.updater.on('checking-for-update', () => { if (!this.ignorePendingCheckEvents) this.patch({ status: 'checking', errorMessage: null, errorContext: null }) })
    this.updater.on('update-available', (info) => {
      if (this.ignorePendingCheckEvents) return
      this.patch({ status: 'available', availableVersion: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes), progressPercent: null, errorContext: null, lastCheckedAt: new Date().toISOString() })
      this.logger.info('updater', 'Atualização disponível.', { event: 'updater.update_available', version: info.version })
    })
    this.updater.on('update-not-available', () => { if (!this.ignorePendingCheckEvents) this.patch({ status: 'up_to_date', availableVersion: null, releaseNotes: null, progressPercent: null, errorContext: null, lastCheckedAt: new Date().toISOString() }) })
    this.updater.on('download-progress', (progress) => this.patch({ status: 'downloading', progressPercent: Math.max(0, Math.min(100, progress.percent)) }))
    this.updater.on('update-downloaded', (info) => {
      this.patch({ status: 'ready', availableVersion: info.version, releaseNotes: normalizeReleaseNotes(info.releaseNotes), progressPercent: 100, errorContext: null })
      this.logger.info('updater', 'Atualização pronta para instalar.', { event: 'updater.update_downloaded', version: info.version })
    })
    this.updater.on('error', (error) => {
      if (this.ignorePendingCheckEvents && this.state.status === 'checking') return
      this.fail('O updater encontrou um erro.', 'updater.error', error, this.state.status === 'downloading' ? 'download' : 'check')
    })
  }

  private patch(patch: Partial<UpdateState>): void { this.state = { ...this.state, ...patch } }

  private fail(message: string, event: string, error: unknown, errorContext: 'check' | 'download'): void {
    this.patch({ status: 'error', errorMessage: message, errorContext, progressPercent: null })
    this.logger.error('updater', message, { event, errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
  }
}

function normalizeReleaseNotes(notes: UpdateInfoLike['releaseNotes']): string | null {
  if (typeof notes === 'string') return notes.trim() || null
  if (!Array.isArray(notes)) return null
  const text = notes.map((item) => `${item.version ? `${item.version}\n` : ''}${item.note ?? ''}`.trim()).filter(Boolean).join('\n\n')
  return text || null
}
