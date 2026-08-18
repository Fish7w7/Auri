import { BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { DomainError, type ApiResult } from '@shared/errors/domain-error'
import type { Logger } from '../logging/logger'
import type { LibraryService } from '../services/library-service'
import type { ProgressService } from '../services/progress-service'
import type { SourceService } from '../services/source-service'
import type { SettingsService } from '../services/settings-service'
import type { SystemService } from '../services/system-service'
import type { WorkService } from '../services/work-service'
import type { WorkDetailsService } from '../services/work-details-service'
import type { AssetService } from '../services/asset-service'
import type { ExternalNavigationService } from '../services/external-navigation-service'
import type { CoverService } from '../services/covers/cover-service'
import type { MetadataService } from '../services/metadata/metadata-service'
import type { BackupService } from '../services/backup/backup-service'
import type { TransferService } from '../services/transfer-service'
import type { UpdateService } from '../services/update-service'
import type { UrlMetadataService } from '../services/url-metadata/url-metadata-service'
import type { BulkLibraryService } from '../services/bulk-library-service'

export interface IpcServices {
  system: SystemService
  works: WorkService
  progress: ProgressService
  sources: SourceService
  library: LibraryService
  settings: SettingsService
  details: WorkDetailsService
  assets: AssetService
  covers: CoverService
  metadata: MetadataService
  urlMetadata: UrlMetadataService
  externalNavigation: ExternalNavigationService
  backups: BackupService
  transfer: TransferService
  updates: UpdateService
  bulk: BulkLibraryService
}

export interface IpcHandlerOptions {
  selectCoverFile?(event: IpcMainInvokeEvent): Promise<string | null>
  selectBackupDirectory?(event: IpcMainInvokeEvent): Promise<string | null>
  selectRestoreFile?(event: IpcMainInvokeEvent): Promise<string | null>
  selectExportFile?(event: IpcMainInvokeEvent, kind: 'json' | 'csv'): Promise<string | null>
  selectImportFile?(event: IpcMainInvokeEvent): Promise<string | null>
  selectDiagnosticFile?(event: IpcMainInvokeEvent): Promise<string | null>
  searchLibrary?(request: unknown): unknown
}

export function registerIpcHandlers(services: IpcServices, logger: Logger, options: IpcHandlerOptions = {}): () => void {
  ipcMain.handle(IPC_CHANNELS.system.getStatus, () => {
    logger.debug('ipc', 'Consulta de status recebida.', { event: 'ipc.system.get_status' })
    return services.system.getStatus()
  })

  const domainHandlers: Array<[string, (request: unknown, event: IpcMainInvokeEvent) => unknown]> = [
    [IPC_CHANNELS.system.getDiagnostics, () => services.system.getDiagnostics()],
    [IPC_CHANNELS.system.checkIntegrity, () => services.system.checkIntegrity()],
    [IPC_CHANNELS.system.clearCoverCache, () => services.system.clearCoverCache()],
    [IPC_CHANNELS.system.openDataFolder, () => openSystemDirectory(services.system.getStatus().paths.root)],
    [IPC_CHANNELS.system.openBackupsFolder, () => {
      const state = services.backups.getState()
      return openSystemDirectory(state.directoryAvailable ? state.directory : services.system.getStatus().paths.backups)
    }],
    [IPC_CHANNELS.system.openLogsFolder, () => openSystemDirectory(services.system.getStatus().paths.logs)],
    [IPC_CHANNELS.system.copySystemInfo, () => { clipboard.writeText(services.system.getSystemInformationText()) }],
    [IPC_CHANNELS.system.exportDiagnostic, async (_request, event) => {
      let destination = options.selectDiagnosticFile ? await options.selectDiagnosticFile(event) : null
      if (!options.selectDiagnosticFile) {
        const owner = BrowserWindow.fromWebContents(event.sender)
        const picker = { title: 'Exportar diagnóstico do Lumi', defaultPath: 'lumi-diagnostic.json', filters: [{ name: 'Diagnóstico JSON', extensions: ['json'] }] }
        const result = owner ? await dialog.showSaveDialog(owner, picker) : await dialog.showSaveDialog(picker)
        destination = result.canceled ? null : result.filePath ?? null
      }
      return destination ? services.system.exportDiagnostic(destination) : null
    }],
    [IPC_CHANNELS.bulk.setStatus, (request) => services.bulk.setStatus(request)],
    [IPC_CHANNELS.bulk.setFavorite, (request) => services.bulk.setFavorite(request)],
    [IPC_CHANNELS.bulk.addTag, (request) => services.bulk.addTag(request)],
    [IPC_CHANNELS.bulk.removeTag, (request) => services.bulk.removeTag(request)],
    [IPC_CHANNELS.bulk.addCollection, (request) => services.bulk.addCollection(request)],
    [IPC_CHANNELS.bulk.removeCollection, (request) => services.bulk.removeCollection(request)],
    [IPC_CHANNELS.bulk.moveToTrash, (request) => services.bulk.moveToTrash(request)],
    [IPC_CHANNELS.works.create, (request) => services.works.createWork(request)],
    [IPC_CHANNELS.works.createDetailed, (request) => services.details.createDetailed(request)],
    [IPC_CHANNELS.works.get, (request) => services.works.getWork(request)],
    [IPC_CHANNELS.works.getDetails, (request) => services.details.getDetails(request)],
    [IPC_CHANNELS.works.update, (request) => services.works.updateWork(request)],
    [IPC_CHANNELS.works.updateDetailed, (request) => services.details.updateDetailed(request)],
    [IPC_CHANNELS.works.list, (request) => services.library.listWorks(request)],
    [IPC_CHANNELS.works.trash, (request) => services.works.moveToTrash(request)],
    [IPC_CHANNELS.works.listTrash, () => services.works.listTrash()],
    [IPC_CHANNELS.works.restore, (request) => services.works.restoreWork(request)],
    [IPC_CHANNELS.works.deletePermanently, (request) => services.works.deletePermanently(request)],
    [IPC_CHANNELS.progress.get, (request) => services.progress.getProgress(request)],
    [IPC_CHANNELS.progress.update, (request) => services.progress.updateProgress(request)],
    [IPC_CHANNELS.progress.increment, (request) => services.progress.incrementProgress(request)],
    [IPC_CHANNELS.progress.decrement, (request) => services.progress.decrementProgress(request)],
    [IPC_CHANNELS.progress.undo, (request) => services.progress.undoProgressChange(request)],
    [IPC_CHANNELS.progress.history, (request) => services.progress.listHistory(request)],
    [IPC_CHANNELS.sources.create, (request) => services.sources.createSource(request)],
    [IPC_CHANNELS.sources.update, (request) => services.sources.updateSource(request)],
    [IPC_CHANNELS.sources.list, (request) => services.sources.listByWork(request)],
    [IPC_CHANNELS.sources.setPreferred, (request) => services.sources.setPreferredSource(request)],
    [IPC_CHANNELS.sources.archive, (request) => services.sources.archiveSource(request)],
    [IPC_CHANNELS.sources.markUnavailable, (request) => services.sources.markSourceUnavailable(request)],
    [IPC_CHANNELS.sources.deletePermanently, (request) => services.sources.deleteSourcePermanently(request)],
    [IPC_CHANNELS.aliases.list, (request) => services.details.listAliases(request)],
    [IPC_CHANNELS.aliases.create, (request) => services.details.createAlias(request)],
    [IPC_CHANNELS.aliases.update, (request) => services.details.updateAlias(request)],
    [IPC_CHANNELS.aliases.delete, (request) => services.details.deleteAlias(request)],
    [IPC_CHANNELS.creators.list, (request) => services.details.listCreators(request)],
    [IPC_CHANNELS.creators.create, (request) => services.details.createCreator(request)],
    [IPC_CHANNELS.creators.update, (request) => services.details.updateCreator(request)],
    [IPC_CHANNELS.creators.delete, (request) => services.details.deleteCreator(request)],
    [IPC_CHANNELS.genres.list, () => services.details.listGenres()],
    [IPC_CHANNELS.genres.create, (request) => services.details.createGenre(request)],
    [IPC_CHANNELS.genres.addToWork, (request) => services.details.addGenreToWork(request)],
    [IPC_CHANNELS.genres.removeFromWork, (request) => services.details.removeGenreFromWork(request)],
    [IPC_CHANNELS.tags.list, () => services.details.listTags()],
    [IPC_CHANNELS.tags.create, (request) => services.details.createTag(request)],
    [IPC_CHANNELS.tags.addToWork, (request) => services.details.addTagToWork(request)],
    [IPC_CHANNELS.tags.removeFromWork, (request) => services.details.removeTagFromWork(request)],
    [IPC_CHANNELS.collections.list, () => services.details.listCollections()],
    [IPC_CHANNELS.collections.create, (request) => services.details.createCollection(request)],
    [IPC_CHANNELS.collections.update, (request) => services.details.updateCollection(request)],
    [IPC_CHANNELS.collections.delete, (request) => services.details.deleteCollection(request)],
    [IPC_CHANNELS.collections.addWork, (request) => services.details.addWorkToCollection(request)],
    [IPC_CHANNELS.collections.removeWork, (request) => services.details.removeWorkFromCollection(request)],
    [IPC_CHANNELS.collections.listForWork, (request) => services.details.listCollectionsForWork(request)],
    [IPC_CHANNELS.assets.selectCover, async (request, event) => {
      let selectedPath = options.selectCoverFile ? await options.selectCoverFile(event) : null
      if (!options.selectCoverFile) {
        const owner = BrowserWindow.fromWebContents(event.sender)
        const pickerOptions: OpenDialogOptions = { title: 'Escolher capa', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }
        const result = owner ? await dialog.showOpenDialog(owner, pickerOptions) : await dialog.showOpenDialog(pickerOptions)
        selectedPath = result.canceled ? null : result.filePaths[0] ?? null
      }
      if (!selectedPath) return null
      const workId = (request as { workId?: unknown })?.workId
      return services.assets.importCustomCover(String(workId ?? ''), selectedPath)
    }],
    [IPC_CHANNELS.assets.setRemoteCover, (request) => services.assets.setRemoteCover(request)],
    [IPC_CHANNELS.assets.removeCover, (request) => services.assets.removeCover(request)],
    [IPC_CHANNELS.assets.readCover, (request) => services.assets.readCover(request)],
    [IPC_CHANNELS.metadata.search, (request) => services.metadata.search(request)],
    [IPC_CHANNELS.metadata.review, (request) => services.metadata.review(request)],
    [IPC_CHANNELS.metadata.import, (request) => services.metadata.import(request)],
    [IPC_CHANNELS.metadata.previewRefresh, (request) => services.metadata.previewRefresh(request)],
    [IPC_CHANNELS.metadata.applyRefresh, (request) => services.metadata.applyRefresh(request)],
    [IPC_CHANNELS.urlMetadata.analyze, (request) => services.urlMetadata.analyze(request)],
    [IPC_CHANNELS.urlMetadata.checkDuplicate, (request) => services.urlMetadata.checkDuplicate(request)],
    [IPC_CHANNELS.covers.get, (request) => services.covers.getCover(request)],
    [IPC_CHANNELS.covers.preview, (request) => services.covers.previewRemoteCover(request)],
    [IPC_CHANNELS.covers.refresh, (request) => services.covers.refreshCover(request)],
    [IPC_CHANNELS.covers.clearWork, (request) => services.covers.clearWorkCache(request)],
    [IPC_CHANNELS.covers.clearAll, () => services.covers.clearAllCache()],
    [IPC_CHANNELS.covers.usage, () => services.covers.getCacheUsage()],
    [IPC_CHANNELS.shell.openExternal, (request) => services.externalNavigation.open(request)],
    [IPC_CHANNELS.library.search, (request) => options.searchLibrary ? options.searchLibrary(request) : services.library.searchWorks(request)],
    [IPC_CHANNELS.library.query, (request) => services.library.queryWorks(request)],
    [IPC_CHANNELS.library.summary, () => services.library.getSummary()],
    [IPC_CHANNELS.library.home, () => services.library.getHome()],
    [IPC_CHANNELS.settings.get, () => services.settings.getSettings()],
    [IPC_CHANNELS.settings.update, (request) => services.settings.updateSettings(request)],
    [IPC_CHANNELS.backup.state, () => services.backups.getState()],
    [IPC_CHANNELS.backup.create, () => services.backups.createBackup('manual')],
    [IPC_CHANNELS.backup.chooseDirectory, async (_request, event) => {
      let selected = options.selectBackupDirectory ? await options.selectBackupDirectory(event) : null
      if (!options.selectBackupDirectory) {
        const owner = BrowserWindow.fromWebContents(event.sender)
        const picker: OpenDialogOptions = { title: 'Escolher pasta de backups', properties: ['openDirectory', 'createDirectory'] }
        const result = owner ? await dialog.showOpenDialog(owner, picker) : await dialog.showOpenDialog(picker)
        selected = result.canceled ? null : result.filePaths[0] ?? null
      }
      if (!selected) return null
      services.settings.updateSettings({ backupDirectory: selected })
      return services.backups.getState()
    }],
    [IPC_CHANNELS.backup.delete, (request) => services.backups.deleteBackup(String((request as { path?: unknown })?.path ?? ''))],
    [IPC_CHANNELS.backup.chooseRestore, async (_request, event) => {
      let selected = options.selectRestoreFile ? await options.selectRestoreFile(event) : null
      if (!options.selectRestoreFile) {
        const owner = BrowserWindow.fromWebContents(event.sender)
        const picker: OpenDialogOptions = { title: 'Restaurar backup do Lumi', properties: ['openFile'], filters: [{ name: 'Backup do Lumi', extensions: ['lumi-backup'] }] }
        const result = owner ? await dialog.showOpenDialog(owner, picker) : await dialog.showOpenDialog(picker)
        selected = result.canceled ? null : result.filePaths[0] ?? null
      }
      return selected ? services.backups.previewBackup(selected) : null
    }],
    [IPC_CHANNELS.backup.restore, (request) => services.backups.restoreBackup(String((request as { path?: unknown })?.path ?? ''))],
    [IPC_CHANNELS.backup.openFolder, async () => {
      const state = services.backups.getState()
      const directory = state.directoryAvailable ? state.directory : services.system.getStatus().paths.backups
      const error = await shell.openPath(directory)
      if (error) throw new DomainError('BACKUP_DIRECTORY_UNAVAILABLE', 'Não foi possível abrir a pasta de backups.')
    }],
    [IPC_CHANNELS.transfer.exportJson, async (_request, event) => {
      const destination = await selectExportPath(event, 'json', options)
      return destination ? services.transfer.exportJson(destination) : null
    }],
    [IPC_CHANNELS.transfer.exportCsv, async (_request, event) => {
      const destination = await selectExportPath(event, 'csv', options)
      return destination ? services.transfer.exportCsv(destination) : null
    }],
    [IPC_CHANNELS.transfer.chooseImport, async (_request, event) => {
      let selected = options.selectImportFile ? await options.selectImportFile(event) : null
      if (!options.selectImportFile) {
        const owner = BrowserWindow.fromWebContents(event.sender)
        const picker: OpenDialogOptions = { title: 'Importar biblioteca do Lumi', properties: ['openFile'], filters: [{ name: 'Exportação JSON do Lumi', extensions: ['json'] }] }
        const result = owner ? await dialog.showOpenDialog(owner, picker) : await dialog.showOpenDialog(picker)
        selected = result.canceled ? null : result.filePaths[0] ?? null
      }
      return selected ? services.transfer.analyzeImport(selected) : null
    }],
    [IPC_CHANNELS.transfer.applyImport, (request) => {
      const value = request as { path?: unknown; strategy?: 'keep_current' | 'use_imported'; restoreTrash?: unknown }
      return services.transfer.applyImport(String(value.path ?? ''), value.strategy, value.restoreTrash === true)
    }],
    [IPC_CHANNELS.updates.state, () => services.updates.getState()],
    [IPC_CHANNELS.updates.check, () => services.updates.checkForUpdates()],
    [IPC_CHANNELS.updates.download, () => services.updates.downloadUpdate()],
    [IPC_CHANNELS.updates.install, () => services.updates.installUpdate()],
    [IPC_CHANNELS.updates.setDirty, (request) => services.updates.setDirty(request)]
  ]

  for (const [channel, operation] of domainHandlers) {
    ipcMain.handle(channel, async (event, request: unknown): Promise<ApiResult<unknown>> => {
      logger.debug('ipc', 'Operação de domínio recebida.', { event: channel })
      try {
        return { ok: true, data: await operation(request, event) }
      } catch (error) {
        if (error instanceof DomainError) {
          logger.warn('ipc', 'Operação de domínio rejeitada.', { event: channel, errorCode: error.code })
          return { ok: false, error: error.toJSON() }
        }
        logger.error('ipc', 'Falha interna em operação de domínio.', {
          event: channel,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN'
        })
        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' }
        }
      }
    })
  }

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.system.getStatus)
    for (const [channel] of domainHandlers) ipcMain.removeHandler(channel)
  }
}

async function selectExportPath(event: IpcMainInvokeEvent, kind: 'json' | 'csv', options: IpcHandlerOptions): Promise<string | null> {
  if (options.selectExportFile) return options.selectExportFile(event, kind)
  const owner = BrowserWindow.fromWebContents(event.sender)
  const picker = { title: kind === 'json' ? 'Exportar biblioteca completa' : 'Exportar resumo CSV', defaultPath: `lumi-biblioteca.${kind}`, filters: [{ name: kind === 'json' ? 'JSON' : 'CSV', extensions: [kind] }] }
  const result = owner ? await dialog.showSaveDialog(owner, picker) : await dialog.showSaveDialog(picker)
  return result.canceled ? null : result.filePath ?? null
}

async function openSystemDirectory(path: string): Promise<void> {
  const error = await shell.openPath(path)
  if (error) throw new DomainError('SYSTEM_FOLDER_UNAVAILABLE', 'Não foi possível abrir esta pasta.')
}
