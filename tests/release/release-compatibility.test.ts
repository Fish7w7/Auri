import { describe, expect, it, vi } from 'vitest'
import { CriticalOperationCoordinator } from '@main/services/critical-operation-coordinator'
import {
  CompatibilityRecoveryService,
  fetchLatestReleaseCompatibilityManifest,
  parseReleaseCompatibilityManifest
} from '@main/services/release-compatibility-service'
import { UpdateService, type UpdaterAdapter } from '@main/services/update-service'
import { SUPPORTED_SCHEMA_VERSION } from '@shared/constants/schema-compatibility'
import { TestLogger } from '../fixtures/test-logger'

function createUpdater(options: { online?: boolean; checkError?: boolean } = {}) {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  const emit = (event: string, ...args: unknown[]) => { for (const handler of handlers.get(event) ?? []) handler(...args) }
  const adapter = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: null,
    on(event: string, listener: (...args: unknown[]) => void) { handlers.set(event, [...(handlers.get(event) ?? []), listener]) },
    checkForUpdates: vi.fn(async () => {
      if (options.checkError) throw new Error('falha simulada')
      emit('update-available', { version: '2.0.0', releaseNotes: null })
    }),
    downloadUpdate: vi.fn(async () => { emit('update-downloaded', { version: '2.0.0', releaseNotes: null }) }),
    quitAndInstall: vi.fn()
  } as unknown as UpdaterAdapter
  const updates = new UpdateService(new TestLogger(), {
    currentVersion: '1.9.0', isPackaged: true, isConfigured: true,
    criticalOperations: new CriticalOperationCoordinator(), updater: adapter,
    isOnline: () => options.online !== false
  })
  return { adapter, updates }
}

function createRecovery(databaseSchema: number, manifest: unknown | null, options: { online?: boolean; checkError?: boolean } = {}) {
  const updater = createUpdater(options)
  const recovery = new CompatibilityRecoveryService(
    updater.updates,
    { load: vi.fn(async () => manifest) },
    { installedVersion: '1.9.0', databaseSchema, supportedSchema: SUPPORTED_SCHEMA_VERSION }
  )
  return { recovery, ...updater }
}

describe('manifesto de compatibilidade', () => {
  it('valida versão e intervalo min/max', () => {
    expect(parseReleaseCompatibilityManifest('{"version":"1.9.0","minSchema":1,"maxSchema":3}')).toEqual({ version: '1.9.0', minSchema: 1, maxSchema: 3 })
    expect(() => parseReleaseCompatibilityManifest({ version: '1.9', minSchema: 3, maxSchema: 2 })).toThrow()
    expect(() => parseReleaseCompatibilityManifest('não-json')).toThrow()
  })

  it('trata metadata ausente e falha HTTP', async () => {
    await expect(fetchLatestReleaseCompatibilityManifest(async () => ({ ok: false, status: 404, text: async () => '' }))).resolves.toBeNull()
    await expect(fetchLatestReleaseCompatibilityManifest(async () => ({ ok: false, status: 500, text: async () => '' }))).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
  })
})

describe('CompatibilityRecoveryService', () => {
  it('identifica atualização compatível e usa download/quitAndInstall normais', async () => {
    const { recovery, adapter } = createRecovery(5, { version: '2.0.0', minSchema: 1, maxSchema: 5 })
    await expect(recovery.check()).resolves.toMatchObject({ status: 'compatible_update_available', availableVersion: '2.0.0' })
    await expect(recovery.download()).resolves.toMatchObject({ status: 'ready' })
    recovery.install()
    expect(adapter.downloadUpdate).toHaveBeenCalledOnce()
    expect(adapter.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('não anuncia como solução uma atualização que ainda não suporta o schema', async () => {
    const { recovery, adapter } = createRecovery(5, { version: '2.0.0', minSchema: 1, maxSchema: 3 })
    await expect(recovery.check()).resolves.toMatchObject({ status: 'incompatible_update_available' })
    await expect(recovery.download()).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' })
    expect(adapter.downloadUpdate).not.toHaveBeenCalled()
  })

  it.each([
    [null, 'missing'],
    [{ version: 'inválida', minSchema: 1, maxSchema: 5 }, 'invalid'],
    [{ version: '2.1.0', minSchema: 1, maxSchema: 5 }, 'version_mismatch']
  ])('não promete compatibilidade com manifesto ausente, inválido ou divergente', async (manifest, issue) => {
    const { recovery } = createRecovery(5, manifest)
    await expect(recovery.check()).resolves.toMatchObject({ status: 'unconfirmed_update_available', manifestIssue: issue })
  })

  it('diferencia offline de erro de verificação e permite tentar novamente', async () => {
    const offlineOptions = { online: false }
    const offline = createRecovery(5, null, offlineOptions)
    await expect(offline.recovery.check()).resolves.toMatchObject({ status: 'offline' })
    expect(offline.adapter.checkForUpdates).not.toHaveBeenCalled()
    offlineOptions.online = true
    await expect(offline.recovery.check()).resolves.toMatchObject({ status: 'unconfirmed_update_available' })

    const failed = createRecovery(5, null, { checkError: true })
    await expect(failed.recovery.check()).resolves.toMatchObject({ status: 'error' })
  })

  it('começa no estado verificando sem consultar ou alterar qualquer biblioteca', () => {
    const { recovery, adapter } = createRecovery(5, null)
    expect(recovery.getState()).toMatchObject({ status: 'checking', databaseSchema: 5, supportedSchema: 3 })
    expect(adapter.checkForUpdates).not.toHaveBeenCalled()
  })
})
