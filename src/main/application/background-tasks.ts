import type { AppContext } from '../app/create-app-context'
import type { MainProcessEnvironment } from './environment'

export function startApplicationBackgroundTasks(
  context: AppContext,
  environment: MainProcessEnvironment
): void {
  void context.services.backups.runAutomaticIfDue().catch((error: unknown) => {
    context.logger.error('backup', 'Falha no backup automático em segundo plano.', {
      event: 'backup.auto_failed',
      errorCode: error instanceof Error ? error.name : 'UNKNOWN'
    })
  })

  if (!environment.isAutomatedRuntime && !context.services.updates.isDevelopmentMock) {
    void context.services.updates.checkForUpdates().catch(() => { /* estado e logging são tratados pelo serviço */ })
  }
}
