import { describe, expect, it, vi } from 'vitest'
import { UpdateService, type UpdaterAdapter } from '@main/services/update-service'
import { CriticalOperationCoordinator } from '@main/services/critical-operation-coordinator'
import { TestLogger } from '../fixtures/test-logger'

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
  it('falha rápido offline em check/download e recupera sem reset manual', async () => {
    const updater = createUpdater()
    let online = false
    const service = new UpdateService(new TestLogger(), {
      currentVersion: '1.9.0', isPackaged: true, isConfigured: true,
      criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter, isOnline: () => online
    })
    updater.adapter.checkForUpdates = vi.fn().mockImplementation(async () => {
      updater.emit('update-available', { version: '2.0.0', releaseNotes: 'Próxima versão' })
    })
    updater.adapter.downloadUpdate = vi.fn().mockImplementation(async () => {
      updater.emit('update-downloaded', { version: '2.0.0', releaseNotes: 'Próxima versão' })
    })

    await expect(service.checkForUpdates()).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED', details: { offline: true } })
    expect(updater.adapter.checkForUpdates).not.toHaveBeenCalled()
    online = true
    await expect(service.checkForUpdates()).resolves.toMatchObject({ status: 'available', availableVersion: '2.0.0' })

    online = false
    await expect(service.downloadUpdate()).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED', details: { offline: true } })
    expect(updater.adapter.downloadUpdate).not.toHaveBeenCalled()
    online = true
    await expect(service.downloadUpdate()).resolves.toMatchObject({ status: 'ready', availableVersion: '2.0.0' })
    expect(updater.adapter.downloadUpdate).toHaveBeenCalledOnce()
  })

  it('não inicia checks ou downloads equivalentes em paralelo', async () => {
    const updater = createUpdater()
    let finishCheck!: () => void
    updater.adapter.checkForUpdates = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishCheck = resolve }))
    const service = new UpdateService(new TestLogger(), { currentVersion: '1.9.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })

    const check = service.checkForUpdates()
    await expect(service.checkForUpdates()).resolves.toMatchObject({ status: 'checking' })
    expect(updater.adapter.checkForUpdates).toHaveBeenCalledOnce()
    finishCheck()
    await expect(check).resolves.toMatchObject({ status: 'up_to_date' })

    updater.emit('update-available', { version: '2.0.0', releaseNotes: null })
    let finishDownload!: () => void
    updater.adapter.downloadUpdate = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve }))
    const download = service.downloadUpdate()
    await expect(service.downloadUpdate()).resolves.toMatchObject({ status: 'downloading' })
    expect(updater.adapter.downloadUpdate).toHaveBeenCalledOnce()
    finishDownload()
    await download
  })

  it('trata desenvolvimento como indisponibilidade normal e não consulta o provider', async () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '0.1.0', isPackaged: false, isConfigured: false, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    expect(await service.checkForUpdates()).toMatchObject({ status: 'unavailable', availability: 'development', currentVersion: '0.1.0' })
    expect(updater.adapter.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.adapter.autoInstallOnAppQuit).toBe(false)
  })

  it('registra na sessão o horário de uma verificação concluída com atualização disponível', async () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '1.7.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    updater.adapter.checkForUpdates = vi.fn().mockImplementation(async () => {
      updater.emit('update-available', { version: '1.7.1', releaseNotes: 'Correções do updater' })
    })

    const state = await service.checkForUpdates()

    expect(state).toMatchObject({ status: 'available', availableVersion: '1.7.1' })
    expect(state.lastCheckedAt).not.toBeNull()
    expect(Number.isNaN(new Date(state.lastCheckedAt!).getTime())).toBe(false)
  })

  it('mantém um único progresso e conclui o download como pronto para instalar', async () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '1.7.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    updater.emit('update-available', { version: '1.7.1', releaseNotes: 'Correções do updater' })

    await service.downloadUpdate()
    updater.emit('download-progress', { percent: 59.4 })
    expect(service.getState()).toMatchObject({ status: 'downloading', availableVersion: '1.7.1', progressPercent: 59.4 })

    updater.emit('update-downloaded', { version: '1.7.1', releaseNotes: 'Correções do updater' })
    expect(service.getState()).toMatchObject({ status: 'ready', availableVersion: '1.7.1', progressPercent: 100 })
  })

  it('permite repetir diretamente um download que falhou', async () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '1.8.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    updater.emit('update-available', { version: '1.9.0', releaseNotes: 'Offline e resiliência' })
    updater.adapter.downloadUpdate = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(async () => { updater.emit('update-downloaded', { version: '1.9.0', releaseNotes: 'Offline e resiliência' }) })

    await expect(service.downloadUpdate()).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' })
    expect(service.getState()).toMatchObject({ status: 'error', errorContext: 'download', availableVersion: '1.9.0' })
    await expect(service.downloadUpdate()).resolves.toMatchObject({ status: 'ready', availableVersion: '1.9.0' })
    expect(updater.adapter.downloadUpdate).toHaveBeenCalledTimes(2)
  })

  it('encerra check preso, ignora resposta antiga e permite nova verificação', async () => {
    vi.useFakeTimers()
    try {
      const updater = createUpdater()
      let finishOld!: () => void
      updater.adapter.checkForUpdates = vi.fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => { finishOld = resolve }))
        .mockImplementationOnce(async () => { updater.emit('update-available', { version: '1.9.0', releaseNotes: 'Recuperada' }) })
      const service = new UpdateService(new TestLogger(), { currentVersion: '1.8.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter, checkTimeoutMs: 20 })

      const expired = service.checkForUpdates()
      const expiredExpectation = expect(expired).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
      await vi.advanceTimersByTimeAsync(20)
      await expiredExpectation
      updater.emit('update-available', { version: '9.9.9', releaseNotes: 'Resposta antiga' })
      expect(service.getState()).toMatchObject({ status: 'error', availableVersion: null, errorContext: 'check' })

      finishOld()
      await Promise.resolve()
      await expect(service.checkForUpdates()).resolves.toMatchObject({ status: 'available', availableVersion: '1.9.0' })
      expect(updater.adapter.checkForUpdates).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
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
    service.installUpdate()
    expect(updater.adapter.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('normaliza o formato real de release notes acumuladas do electron-updater', () => {
    const updater = createUpdater()
    const service = new UpdateService(new TestLogger(), { currentVersion: '1.0.0', isPackaged: true, isConfigured: true, criticalOperations: new CriticalOperationCoordinator(), updater: updater.adapter })
    updater.emit('update-available', {
      version: '1.2.0',
      releaseNotes: [
        { version: '1.2.0', note: '<h2>Novidades</h2><ul><li>Leitura melhor</li></ul>' },
        { version: '1.1.0', note: '<p>Janela integrada.</p>' }
      ]
    })

    expect(service.getState()).toMatchObject({
      status: 'available',
      availableVersion: '1.2.0',
      releaseNotes: '1.2.0\n<h2>Novidades</h2><ul><li>Leitura melhor</li></ul>\n\n1.1.0\n<p>Janela integrada.</p>'
    })
  })
})
