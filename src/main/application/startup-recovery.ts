import { join } from 'node:path'
import { app, clipboard, dialog, net, shell } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'
import { DomainError } from '@shared/errors/domain-error'
import { MIN_SUPPORTED_SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSION } from '@shared/constants/schema-compatibility'
import { CURRENT_LOG_FILE_NAME } from '../app/app-identity'
import { resolveDataPaths } from '../app/data-paths'
import { JsonLogger } from '../logging/logger'
import { CriticalOperationCoordinator } from '../services/critical-operation-coordinator'
import { classifyDatabaseOpenFailure, createRecoveryBackupService } from '../services/database-recovery-service'
import { createApplicationUpdateService } from '../services/application-update-service'
import {
  CompatibilityRecoveryService,
  fetchLatestReleaseCompatibilityManifest,
  type CompatibilityRecoveryState
} from '../services/release-compatibility-service'

export async function showStartupRecovery(error: unknown): Promise<void> {
  const failure = classifyDatabaseOpenFailure(error)
  const paths = resolveDataPaths(app.getPath('userData'))
  const logger = new JsonLogger(join(paths.logs, CURRENT_LOG_FILE_NAME), !app.isPackaged)
  logger.error('database', 'Inicialização entrou no fluxo de recuperação.', { event: 'database.recovery_opened', errorCode: failure.kind })
  if (failure.kind === 'schema_too_new' && failure.databaseSchema !== undefined && failure.supportedSchema !== undefined) {
    await showCompatibilityRecovery(failure.databaseSchema, failure.supportedSchema, paths.root, logger, failure.technicalDetails)
    return
  }
  while (true) {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Não foi possível abrir sua biblioteca',
      message: failure.title,
      detail: `${failure.explanation}\n\nNenhum dado foi alterado automaticamente.`,
      buttons: ['Tentar novamente', 'Restaurar backup', 'Abrir pasta de dados', 'Ver detalhes', `Fechar ${APP_BRAND.name}`],
      defaultId: 0,
      cancelId: 4,
      noLink: true
    })
    if (result.response === 0) {
      app.relaunch()
      app.exit(0)
      return
    }
    if (result.response === 1) {
      if (await requestRecoveryRestore(logger)) return
      continue
    }
    if (result.response === 2) {
      const openError = await shell.openPath(paths.root)
      if (openError) await dialog.showMessageBox({ type: 'error', message: 'Não foi possível abrir a pasta de dados.', detail: openError, buttons: ['Voltar'] })
      continue
    }
    if (result.response === 3) {
      const detailResult = await dialog.showMessageBox({
        type: 'info',
        title: 'Detalhes técnicos',
        message: failure.title,
        detail: failure.technicalDetails,
        buttons: ['Copiar detalhes', 'Voltar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (detailResult.response === 0) clipboard.writeText(`${APP_BRAND.name} ${app.getVersion()}\n${failure.technicalDetails}`)
      continue
    }
    app.quit()
    return
  }
}

async function showCompatibilityRecovery(
  databaseSchema: number,
  supportedSchema: number,
  dataRoot: string,
  logger: JsonLogger,
  technicalDetails: string
): Promise<void> {
  const updates = createApplicationUpdateService(app, logger, new CriticalOperationCoordinator())
  const recovery = new CompatibilityRecoveryService(
    updates,
    {
      load: updates.isDevelopmentMock
        ? async () => ({
          version: updates.getState().availableVersion ?? app.getVersion(),
          minSchema: MIN_SUPPORTED_SCHEMA_VERSION,
          maxSchema: Number(process.env.AURI_DEV_COMPATIBILITY_MAX_SCHEMA ?? SUPPORTED_SCHEMA_VERSION)
        })
        : async () => {
          if (!net.isOnline()) throw new DomainError('UPDATE_CHECK_FAILED', 'Sem conexão para consultar o manifesto.', { offline: true })
          return fetchLatestReleaseCompatibilityManifest((url) => net.fetch(url))
        }
    },
    { installedVersion: app.getVersion(), databaseSchema, supportedSchema }
  )

  try {
    let state = await recovery.check()
    while (true) {
      const actions = compatibilityRecoveryActions(state)
      const result = await dialog.showMessageBox({
        type: state.status === 'compatible_update_available' || state.status === 'ready' ? 'info' : 'warning',
        title: 'Compatibilidade da biblioteca',
        message: 'Uma atualização do Auri é necessária',
        detail: [
          'Sua biblioteca foi usada por uma versão mais recente do Auri e não pode ser aberta com a versão instalada.',
          '',
          `Versão instalada: ${state.installedVersion}`,
          `Schema da biblioteca: ${state.databaseSchema}`,
          `Schema máximo suportado: ${state.supportedSchema}`,
          '',
          state.message,
          '',
          'Seus dados continuam seguros. Nenhum dado foi alterado automaticamente.'
        ].join('\n'),
        buttons: actions.map((action) => action.label),
        defaultId: 0,
        cancelId: actions.length - 1,
        noLink: true
      })
      const action = actions[result.response]?.id
      if (action === 'update') {
        if (state.status === 'compatible_update_available') state = await recovery.download()
        if (state.status === 'ready') {
          recovery.install()
          return
        }
        continue
      }
      if (action === 'retry') {
        state = await recovery.check()
        continue
      }
      if (action === 'restore') {
        if (await requestRecoveryRestore(logger)) return
        continue
      }
      if (action === 'open') {
        const openError = await shell.openPath(dataRoot)
        if (openError) await dialog.showMessageBox({ type: 'error', message: 'Não foi possível abrir a pasta de dados.', detail: openError, buttons: ['Voltar'] })
        continue
      }
      if (action === 'details') {
        const detailResult = await dialog.showMessageBox({
          type: 'info',
          title: 'Detalhes técnicos',
          message: 'Compatibilidade da biblioteca',
          detail: `${technicalDetails}\nManifesto: ${state.manifestIssue ?? 'consultado'}${state.manifest ? `\nFaixa publicada: ${state.manifest.minSchema}–${state.manifest.maxSchema}` : ''}`,
          buttons: ['Copiar detalhes', 'Voltar'],
          defaultId: 1,
          cancelId: 1,
          noLink: true
        })
        if (detailResult.response === 0) clipboard.writeText(`${APP_BRAND.name} ${app.getVersion()}\n${technicalDetails}`)
        continue
      }
      app.quit()
      return
    }
  } finally { updates.dispose() }
}

function compatibilityRecoveryActions(state: CompatibilityRecoveryState): Array<{ id: 'update' | 'retry' | 'restore' | 'open' | 'details' | 'close'; label: string }> {
  return [
    ...(state.status === 'compatible_update_available' || state.status === 'ready'
      ? [{ id: 'update' as const, label: state.status === 'ready' ? 'Instalar e reiniciar' : 'Atualizar Auri' }]
      : []),
    { id: 'retry', label: 'Tentar novamente' },
    { id: 'restore', label: 'Restaurar backup' },
    { id: 'open', label: 'Abrir pasta de dados' },
    { id: 'details', label: 'Ver detalhes' },
    { id: 'close', label: `Fechar ${APP_BRAND.name}` }
  ]
}

async function requestRecoveryRestore(logger: JsonLogger): Promise<boolean> {
  const selected = await dialog.showOpenDialog({ title: `Restaurar backup do ${APP_BRAND.name}`, properties: ['openFile'], filters: [{ name: `Backup do ${APP_BRAND.name}`, extensions: ['auri-backup', 'lumi-backup'] }] })
  if (selected.canceled || !selected.filePaths[0]) return false
  const recovery = createRecoveryBackupService(app, logger)
  try {
    const preview = await recovery.backups.previewBackup(selected.filePaths[0])
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: 'Confirmar restauração',
      message: 'Restaurar esta biblioteca?',
      detail: `Backup de ${new Date(preview.createdAt).toLocaleString('pt-BR')}, com ${preview.workCount} obras. O arquivo atual será preservado separadamente para recuperação.`,
      buttons: ['Cancelar', 'Restaurar e reiniciar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (confirmation.response === 1) {
      await recovery.backups.restoreBackup(selected.filePaths[0])
      return true
    }
  } catch (restoreError) {
    await dialog.showMessageBox({ type: 'error', title: 'Restauração não concluída', message: 'Não foi possível restaurar este backup com segurança.', detail: restoreError instanceof Error ? restoreError.message : 'Erro desconhecido.', buttons: ['Voltar'], noLink: true })
  } finally { recovery.dispose() }
  return false
}


