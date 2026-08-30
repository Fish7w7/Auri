import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { net, type App } from 'electron'
import type { Logger } from '../logging/logger'
import { CriticalOperationCoordinator } from './critical-operation-coordinator'
import { DevelopmentUpdaterMock, resolveDevelopmentUpdaterScenario, shouldUseDevelopmentUpdaterMock } from './development-updater-mock'
import { UpdateService, type UpdaterAdapter } from './update-service'

export interface ApplicationUpdateServiceOptions {
  updater?: UpdaterAdapter
  updaterEnvironment?: { isPackaged: boolean; isConfigured: boolean }
}

export function createApplicationUpdateService(
  app: Pick<App, 'getVersion' | 'isPackaged'>,
  logger: Logger,
  criticalOperations: CriticalOperationCoordinator,
  options: ApplicationUpdateServiceOptions = {}
): UpdateService {
  const environment = options.updaterEnvironment ?? {
    isPackaged: app.isPackaged,
    isConfigured: app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
  }
  const developmentUpdaterMock = !options.updater && shouldUseDevelopmentUpdaterMock(app.isPackaged)
    ? new DevelopmentUpdaterMock(logger, app.getVersion(), resolveDevelopmentUpdaterScenario())
    : undefined
  const updates = new UpdateService(logger, {
    currentVersion: app.getVersion(),
    ...environment,
    isDevelopmentMock: Boolean(developmentUpdaterMock),
    criticalOperations,
    updater: developmentUpdaterMock ?? options.updater,
    isOnline: () => net.isOnline()
  })
  updates.configure('stable')
  return updates
}
