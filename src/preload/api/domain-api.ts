import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import type { ApiResult, DomainErrorShape, LumiApi } from '@shared/contracts'

export class LumiClientError extends Error {
  constructor(readonly error: DomainErrorShape) {
    super(error.message)
    this.name = 'LumiClientError'
  }
}

async function invoke<T>(channel: string, request?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, request)) as ApiResult<T>
  if (!result.ok) throw new LumiClientError(result.error)
  return result.data
}

export const domainApi: Omit<LumiApi, 'system' | 'settings'> = {
  bulk: {
    setStatus: (request) => invoke(IPC_CHANNELS.bulk.setStatus, request),
    setFavorite: (request) => invoke(IPC_CHANNELS.bulk.setFavorite, request),
    addTag: (request) => invoke(IPC_CHANNELS.bulk.addTag, request),
    removeTag: (request) => invoke(IPC_CHANNELS.bulk.removeTag, request),
    addCollection: (request) => invoke(IPC_CHANNELS.bulk.addCollection, request),
    removeCollection: (request) => invoke(IPC_CHANNELS.bulk.removeCollection, request),
    moveToTrash: (request) => invoke(IPC_CHANNELS.bulk.moveToTrash, request)
  },
  works: {
    create: (request) => invoke(IPC_CHANNELS.works.create, request),
    createDetailed: (request) => invoke(IPC_CHANNELS.works.createDetailed, request),
    get: (request) => invoke(IPC_CHANNELS.works.get, request),
    getDetails: (request) => invoke(IPC_CHANNELS.works.getDetails, request),
    update: (request) => invoke(IPC_CHANNELS.works.update, request),
    updateDetailed: (request) => invoke(IPC_CHANNELS.works.updateDetailed, request),
    list: (request) => invoke(IPC_CHANNELS.works.list, request),
    trash: (request) => invoke(IPC_CHANNELS.works.trash, request),
    listTrash: () => invoke(IPC_CHANNELS.works.listTrash),
    restore: (request) => invoke(IPC_CHANNELS.works.restore, request),
    deletePermanently: (request) => invoke(IPC_CHANNELS.works.deletePermanently, request)
  },
  progress: {
    get: (request) => invoke(IPC_CHANNELS.progress.get, request),
    update: (request) => invoke(IPC_CHANNELS.progress.update, request),
    increment: (request) => invoke(IPC_CHANNELS.progress.increment, request),
    decrement: (request) => invoke(IPC_CHANNELS.progress.decrement, request),
    undo: (request) => invoke(IPC_CHANNELS.progress.undo, request),
    history: (request) => invoke(IPC_CHANNELS.progress.history, request)
  },
  sources: {
    create: (request) => invoke(IPC_CHANNELS.sources.create, request),
    update: (request) => invoke(IPC_CHANNELS.sources.update, request),
    list: (request) => invoke(IPC_CHANNELS.sources.list, request),
    setPreferred: (request) => invoke(IPC_CHANNELS.sources.setPreferred, request),
    archive: (request) => invoke(IPC_CHANNELS.sources.archive, request),
    markUnavailable: (request) => invoke(IPC_CHANNELS.sources.markUnavailable, request),
    deletePermanently: (request) => invoke(IPC_CHANNELS.sources.deletePermanently, request)
  },
  aliases: {
    list: (request) => invoke(IPC_CHANNELS.aliases.list, request),
    create: (request) => invoke(IPC_CHANNELS.aliases.create, request),
    update: (request) => invoke(IPC_CHANNELS.aliases.update, request),
    delete: (request) => invoke(IPC_CHANNELS.aliases.delete, request)
  },
  creators: {
    list: (request) => invoke(IPC_CHANNELS.creators.list, request),
    create: (request) => invoke(IPC_CHANNELS.creators.create, request),
    update: (request) => invoke(IPC_CHANNELS.creators.update, request),
    delete: (request) => invoke(IPC_CHANNELS.creators.delete, request)
  },
  genres: {
    list: () => invoke(IPC_CHANNELS.genres.list),
    create: (request) => invoke(IPC_CHANNELS.genres.create, request),
    addToWork: (request) => invoke(IPC_CHANNELS.genres.addToWork, request),
    removeFromWork: (request) => invoke(IPC_CHANNELS.genres.removeFromWork, request)
  },
  tags: {
    list: () => invoke(IPC_CHANNELS.tags.list),
    create: (request) => invoke(IPC_CHANNELS.tags.create, request),
    addToWork: (request) => invoke(IPC_CHANNELS.tags.addToWork, request),
    removeFromWork: (request) => invoke(IPC_CHANNELS.tags.removeFromWork, request)
  },
  collections: {
    list: () => invoke(IPC_CHANNELS.collections.list),
    create: (request) => invoke(IPC_CHANNELS.collections.create, request),
    update: (request) => invoke(IPC_CHANNELS.collections.update, request),
    delete: (request) => invoke(IPC_CHANNELS.collections.delete, request),
    addWork: (request) => invoke(IPC_CHANNELS.collections.addWork, request),
    removeWork: (request) => invoke(IPC_CHANNELS.collections.removeWork, request),
    listForWork: (request) => invoke(IPC_CHANNELS.collections.listForWork, request)
  },
  assets: {
    selectCover: (request) => invoke(IPC_CHANNELS.assets.selectCover, request),
    setRemoteCover: (request) => invoke(IPC_CHANNELS.assets.setRemoteCover, request),
    removeCover: (request) => invoke(IPC_CHANNELS.assets.removeCover, request),
    readCover: (request) => invoke(IPC_CHANNELS.assets.readCover, request)
  },
  metadata: {
    search: (request) => invoke(IPC_CHANNELS.metadata.search, request),
    review: (request) => invoke(IPC_CHANNELS.metadata.review, request),
    import: (request) => invoke(IPC_CHANNELS.metadata.import, request),
    previewRefresh: (request) => invoke(IPC_CHANNELS.metadata.previewRefresh, request),
    applyRefresh: (request) => invoke(IPC_CHANNELS.metadata.applyRefresh, request)
  },
  urlMetadata: {
    analyze: (request) => invoke(IPC_CHANNELS.urlMetadata.analyze, request),
    checkDuplicate: (request) => invoke(IPC_CHANNELS.urlMetadata.checkDuplicate, request)
  },
  covers: {
    get: (request) => invoke(IPC_CHANNELS.covers.get, request),
    preview: (request) => invoke(IPC_CHANNELS.covers.preview, request),
    refresh: (request) => invoke(IPC_CHANNELS.covers.refresh, request),
    clearWork: (request) => invoke(IPC_CHANNELS.covers.clearWork, request),
    clearAll: () => invoke(IPC_CHANNELS.covers.clearAll),
    usage: () => invoke(IPC_CHANNELS.covers.usage)
  },
  shell: {
    openExternal: (request) => invoke(IPC_CHANNELS.shell.openExternal, request)
  },
  library: {
    search: (request) => invoke(IPC_CHANNELS.library.search, request),
    query: (request) => invoke(IPC_CHANNELS.library.query, request),
    summary: () => invoke(IPC_CHANNELS.library.summary),
    home: () => invoke(IPC_CHANNELS.library.home)
  },
  backup: {
    state: () => invoke(IPC_CHANNELS.backup.state),
    create: () => invoke(IPC_CHANNELS.backup.create),
    chooseDirectory: () => invoke(IPC_CHANNELS.backup.chooseDirectory),
    delete: (request) => invoke(IPC_CHANNELS.backup.delete, request),
    chooseRestore: () => invoke(IPC_CHANNELS.backup.chooseRestore),
    restore: (request) => invoke(IPC_CHANNELS.backup.restore, request),
    openFolder: () => invoke(IPC_CHANNELS.backup.openFolder)
  },
  transfer: {
    exportJson: () => invoke(IPC_CHANNELS.transfer.exportJson),
    exportCsv: () => invoke(IPC_CHANNELS.transfer.exportCsv),
    chooseImport: () => invoke(IPC_CHANNELS.transfer.chooseImport),
    applyImport: (request) => invoke(IPC_CHANNELS.transfer.applyImport, request)
  },
  updates: {
    state: () => invoke(IPC_CHANNELS.updates.state),
    check: () => invoke(IPC_CHANNELS.updates.check),
    download: () => invoke(IPC_CHANNELS.updates.download),
    install: () => invoke(IPC_CHANNELS.updates.install),
    setDirty: (request) => invoke(IPC_CHANNELS.updates.setDirty, request)
  }
}

export const settingsApi = {
  get: () => invoke<import('@shared/contracts').AppSettings>(IPC_CHANNELS.settings.get),
  update: (request: import('@shared/contracts').UpdateSettingsRequest) =>
    invoke<import('@shared/contracts').AppSettings>(IPC_CHANNELS.settings.update, request)
}
