import { describe, expect, it, vi } from 'vitest'
import { UpdateService, type UpdaterAdapter } from '@main/services/update-service'
import { CriticalOperationCoordinator } from '@main/services/critical-operation-coordinator'
import { TestLogger } from '../helpers/test-logger'

function createUpdater() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  return {
    adapter: {
      autoDownload: true, autoInstallOnAppQuit: true, channel: null,
      on(event: string, listener: (...args: unknown[]) => void) { handlers.set(event, [...(handlers.get(event) ?? []), listener]) },
      checkForUpdates: vi.fn().mockResolvedValue(null),
      downloadUpdate: vi.fn().mockResolvedValue([]),
      quitAndInstall: vi.fn()
    } as unknown as UpdaterAdapter,
    emit(event: string, ...args: unknown[]) { for (const handler of handlers.get(event) ?? []) handler(...args) }
  }
}

describe('UpdateService', () => {
  it('trata desenvolvimento como indisponibilidade normal e não consulta o provider', async () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '0.1.0', isPackaged: false, isConfigured: false, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    expect(await service.checkForUpdates()).toMatchObject({ status: 'unavailable', availability: 'development', currentVersion: '0.1.0' })
    expect(updater.adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.adapter.autoInstallOnAppQuit).toBe(false)
  })

  it('bloqueia instalação durante operação crítica e com edição suja', async () => {
    const updater = createUpdater()
    const critical = new CriticalOperationCoordinator()
    const service = new UpdateService(new TestLogger(), { currentVersion: '0.1.0', isPackaged: true, isConfigured: true, criticalOperations: critical, updater: updater.adapter })
    updater.emit('update-downloaded', { version: '0.2.0', releaseNotes: 'Notas' })

    let release!: () => void
    const active = critical.run('import', () => new Promise<void>((resolve) => { release = resolve }))
    expect(() => service.installUpdate()).toThrowError(expect.objectContaining({ code: 'UPDATE_INSTALL_BLOCKED' }))
    release(); await active

    service.setDirty({ scope: 'work-editor', dirty: true })
    expect(() => service.installUpdate()).toThrowError(expect.objectContaining({ code: 'UPDATE_INSTALL_BLOCKED' }))
    service.setDirty({ scope: 'work-editor', dirty: false })
    service.installUpdate()
    expect(updater.adapter.quitAndInstall).toHaveBeenCalledOnce()
  })
})
