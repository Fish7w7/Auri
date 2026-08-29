import { describe, expect, it } from 'vitest'
import { CriticalOperationCoordinator } from '@main/services/critical-operation-coordinator'
import { DevelopmentUpdaterMock, shouldUseDevelopmentUpdaterMock, type DevelopmentUpdaterScenario } from '@main/services/development-updater-mock'
import { UpdateService } from '@main/services/update-service'
import { TestLogger } from '../helpers/test-logger'

function createService(scenario: DevelopmentUpdaterScenario) {
  const logger = new TestLogger()
  const updater = new DevelopmentUpdaterMock(logger, '1.7.1', scenario, 0)
  const service = new UpdateService(logger, {
    currentVersion: '1.7.1',
    isPackaged: false,
    isConfigured: false,
    isDevelopmentMock: true,
    criticalOperations: new CriticalOperationCoordinator(),
    updater,
    isOnline: () => false,
  })
  return { logger, updater, service }
}

describe('mock de desenvolvimento do updater', () => {
  it('só pode ser ativado explicitamente fora do aplicativo empacotado', () => {
    expect(shouldUseDevelopmentUpdaterMock(false, '1')).toBe(true)
    expect(shouldUseDevelopmentUpdaterMock(false, '')).toBe(false)
    expect(shouldUseDevelopmentUpdaterMock(true, '1')).toBe(false)
  })

  it('usa o UpdateService real para verificar, baixar e chegar ao estado pronto', async () => {
    const { logger, updater, service } = createService('available')
    const progress: number[] = []
    updater.on('download-progress', ({ percent }) => progress.push(percent))

    expect(service.getState()).toMatchObject({ status: 'idle', isDevelopmentMock: true, availability: 'ready' })
    const available = await service.checkForUpdates()
    expect(available).toMatchObject({ status: 'available', availableVersion: '1.7.2', isDevelopmentMock: true })
    expect(available.lastCheckedAt).not.toBeNull()
    expect(available.releaseNotes).toContain('Atualização simulada')

    await service.downloadUpdate()
    expect(progress).toEqual([0, 25, 59, 100])
    expect(service.getState()).toMatchObject({ status: 'ready', availableVersion: '1.7.2', progressPercent: 100 })

    service.installUpdate()
    expect(logger.entries.some((entry) => entry.message.includes('[UpdaterMock] install simulated 1.7.2'))).toBe(true)
    service.dispose()
  })

  it('apresenta erros amigáveis para falhas simuladas de verificação e download', async () => {
    const checkFailure = createService('check-error')
    await expect(checkFailure.service.checkForUpdates()).rejects.toMatchObject({ code: 'UPDATE_CHECK_FAILED' })
    expect(checkFailure.service.getState()).toMatchObject({ status: 'error', errorMessage: 'Não foi possível verificar atualizações.', lastCheckedAt: null })
    checkFailure.service.dispose()

    const downloadFailure = createService('download-error')
    await downloadFailure.service.checkForUpdates()
    await expect(downloadFailure.service.downloadUpdate()).rejects.toMatchObject({ code: 'UPDATE_DOWNLOAD_FAILED' })
    expect(downloadFailure.service.getState()).toMatchObject({ status: 'error', errorMessage: 'Não foi possível baixar a atualização.' })
    downloadFailure.service.dispose()
  })
})
