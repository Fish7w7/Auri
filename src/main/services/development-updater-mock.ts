import type { Logger } from '../logging/logger'
import type { UpdaterAdapter } from './update-service'

export const DEVELOPMENT_UPDATER_SCENARIOS = ['up-to-date', 'available', 'download', 'ready', 'check-error', 'download-error'] as const

export type DevelopmentUpdaterScenario = (typeof DEVELOPMENT_UPDATER_SCENARIOS)[number]

interface MockUpdateInfo {
  version: string
  releaseNotes: string
}

type MockListener = (...args: any[]) => void

export function shouldUseDevelopmentUpdaterMock(isPackaged: boolean, flag = process.env.AURI_DEV_UPDATER_MOCK): boolean {
  return !isPackaged && flag === '1'
}

export function resolveDevelopmentUpdaterScenario(value = process.env.AURI_DEV_UPDATER_SCENARIO): DevelopmentUpdaterScenario {
  return DEVELOPMENT_UPDATER_SCENARIOS.includes(value as DevelopmentUpdaterScenario) ? value as DevelopmentUpdaterScenario : 'available'
}

export class DevelopmentUpdaterMock implements UpdaterAdapter {
  autoDownload = false
  autoInstallOnAppQuit = false
  channel: string | null = null

  private readonly listeners = new Map<string, Set<MockListener>>()
  private readonly timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  private readonly availableVersion: string
  private readonly releaseNotes: string
  private generation = 0
  private disposed = false

  constructor(
    private readonly logger: Logger,
    private readonly currentVersion: string,
    readonly scenario: DevelopmentUpdaterScenario,
    private readonly transitionDelayMs = 280
  ) {
    this.availableVersion = nextPatchVersion(currentVersion)
    this.releaseNotes = simulatedReleaseNotes(this.availableVersion)
    this.logger.info('updater', '[UpdaterMock] ativado', { event: 'updater.mock_enabled', scenario })
  }

  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'checking-for-update', listener: () => void): this
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: MockUpdateInfo) => void): this
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): this
  on(event: string, listener: MockListener): this {
    const listeners = this.listeners.get(event) ?? new Set<MockListener>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  async checkForUpdates(): Promise<null> {
    const run = this.beginRun()
    if (this.disposed) return null
    this.log('checking', 'updater.mock_checking')
    this.emit('checking-for-update')
    if (!await this.wait(run)) return null

    if (this.scenario === 'check-error') {
      this.logger.warn('updater', '[UpdaterMock] check-error', { event: 'updater.mock_check_error', scenario: this.scenario })
      throw new Error('Simulated updater check failure')
    }

    if (this.scenario === 'up-to-date') {
      this.log('update-not-available ' + this.currentVersion, 'updater.mock_up_to_date')
      this.emit('update-not-available', { version: this.currentVersion, releaseNotes: '' })
      return null
    }

    const info = { version: this.availableVersion, releaseNotes: this.releaseNotes }
    if (this.scenario === 'ready') {
      this.log('update-downloaded ' + this.availableVersion, 'updater.mock_ready')
      this.emit('update-downloaded', info)
      return null
    }

    this.log('update-available ' + this.availableVersion, 'updater.mock_available')
    this.emit('update-available', info)
    if (this.scenario === 'download' && await this.wait(run)) await this.simulateDownload(run, false)
    return null
  }

  async downloadUpdate(): Promise<[]> {
    const run = this.beginRun()
    if (!this.disposed) await this.simulateDownload(run, this.scenario === 'download-error')
    return []
  }

  quitAndInstall(): void {
    this.log('install simulated ' + this.availableVersion, 'updater.mock_install')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.clearTimers()
    this.listeners.clear()
    this.log('disposed', 'updater.mock_disposed')
  }

  private async simulateDownload(run: number, shouldFail: boolean): Promise<void> {
    for (const percent of [0, 25, 59, 100]) {
      if (percent > 0 && !await this.wait(run)) return
      this.log('download-progress ' + percent + '%', 'updater.mock_download_progress', percent)
      this.emit('download-progress', { percent })
      if (shouldFail && percent === 59) {
        this.logger.warn('updater', '[UpdaterMock] download-error', { event: 'updater.mock_download_error', scenario: this.scenario, percent })
        throw new Error('Simulated updater download failure')
      }
    }
    if (run !== this.generation || this.disposed) return
    this.log('update-downloaded ' + this.availableVersion, 'updater.mock_ready')
    this.emit('update-downloaded', { version: this.availableVersion, releaseNotes: this.releaseNotes })
  }

  private beginRun(): number {
    this.generation += 1
    this.clearTimers()
    return this.generation
  }

  private wait(run: number): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>
      const finish = () => {
        this.timers.delete(timer)
        resolve(!this.disposed && run === this.generation)
      }
      timer = setTimeout(finish, this.transitionDelayMs)
      this.timers.set(timer, () => { clearTimeout(timer); finish() })
    })
  }

  private clearTimers(): void {
    for (const cancel of [...this.timers.values()]) cancel()
    this.timers.clear()
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }

  private log(message: string, event: string, percent?: number): void {
    this.logger.info('updater', '[UpdaterMock] ' + message, { event, scenario: this.scenario, percent })
  }
}

function nextPatchVersion(currentVersion: string): string {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/)
  return match ? match[1] + '.' + match[2] + '.' + (Number(match[3]) + 1) : '1.7.2'
}

function simulatedReleaseNotes(version: string): string {
  return '# Auri ' + version + ' — Atualização simulada\n\n- Teste de release notes\n- Teste do estado de download\n- Teste da instalação pronta'
}
