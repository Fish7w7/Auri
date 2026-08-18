export const IPC_CHANNELS = {
  bulk: {
    setStatus: 'lumi:bulk:set-status',
    setFavorite: 'lumi:bulk:set-favorite',
    addTag: 'lumi:bulk:add-tag',
    removeTag: 'lumi:bulk:remove-tag',
    addCollection: 'lumi:bulk:add-collection',
    removeCollection: 'lumi:bulk:remove-collection',
    moveToTrash: 'lumi:bulk:move-to-trash'
  },
  system: {
    getStatus: 'lumi:system:get-status',
    getDiagnostics: 'lumi:system:get-diagnostics',
    checkIntegrity: 'lumi:system:check-integrity',
    clearCoverCache: 'lumi:system:clear-cover-cache',
    openDataFolder: 'lumi:system:open-data-folder',
    openBackupsFolder: 'lumi:system:open-backups-folder',
    openLogsFolder: 'lumi:system:open-logs-folder',
    copySystemInfo: 'lumi:system:copy-info',
    exportDiagnostic: 'lumi:system:export-diagnostic'
  },
  works: {
    create: 'lumi:works:create',
    createDetailed: 'lumi:works:create-detailed',
    get: 'lumi:works:get',
    getDetails: 'lumi:works:get-details',
    update: 'lumi:works:update',
    updateDetailed: 'lumi:works:update-detailed',
    list: 'lumi:works:list',
    trash: 'lumi:works:trash',
    listTrash: 'lumi:works:list-trash',
    restore: 'lumi:works:restore',
    deletePermanently: 'lumi:works:delete-permanently'
  },
  progress: {
    get: 'lumi:progress:get',
    update: 'lumi:progress:update',
    increment: 'lumi:progress:increment',
    decrement: 'lumi:progress:decrement',
    undo: 'lumi:progress:undo',
    history: 'lumi:progress:history'
  },
  sources: {
    create: 'lumi:sources:create',
    update: 'lumi:sources:update',
    list: 'lumi:sources:list',
    setPreferred: 'lumi:sources:set-preferred',
    archive: 'lumi:sources:archive',
    markUnavailable: 'lumi:sources:mark-unavailable',
    deletePermanently: 'lumi:sources:delete-permanently'
  },
  aliases: {
    list: 'lumi:aliases:list', create: 'lumi:aliases:create', update: 'lumi:aliases:update', delete: 'lumi:aliases:delete'
  },
  creators: {
    list: 'lumi:creators:list', create: 'lumi:creators:create', update: 'lumi:creators:update', delete: 'lumi:creators:delete'
  },
  genres: {
    list: 'lumi:genres:list', create: 'lumi:genres:create', addToWork: 'lumi:genres:add-to-work', removeFromWork: 'lumi:genres:remove-from-work'
  },
  tags: {
    list: 'lumi:tags:list', create: 'lumi:tags:create', addToWork: 'lumi:tags:add-to-work', removeFromWork: 'lumi:tags:remove-from-work'
  },
  collections: {
    list: 'lumi:collections:list', create: 'lumi:collections:create', update: 'lumi:collections:update', delete: 'lumi:collections:delete', addWork: 'lumi:collections:add-work', removeWork: 'lumi:collections:remove-work', listForWork: 'lumi:collections:list-for-work'
  },
  assets: {
    selectCover: 'lumi:assets:select-cover', setRemoteCover: 'lumi:assets:set-remote-cover', removeCover: 'lumi:assets:remove-cover', readCover: 'lumi:assets:read-cover'
  },
  shell: {
    openExternal: 'lumi:shell:open-external'
  },
  metadata: {
    search: 'lumi:metadata:search', review: 'lumi:metadata:review', import: 'lumi:metadata:import',
    previewRefresh: 'lumi:metadata:preview-refresh', applyRefresh: 'lumi:metadata:apply-refresh'
  },
  urlMetadata: {
    analyze: 'lumi:url-metadata:analyze',
    checkDuplicate: 'lumi:url-metadata:check-duplicate'
  },
  covers: {
    get: 'lumi:covers:get', preview: 'lumi:covers:preview', refresh: 'lumi:covers:refresh', clearWork: 'lumi:covers:clear-work',
    clearAll: 'lumi:covers:clear-all', usage: 'lumi:covers:usage'
  },
  library: {
    search: 'lumi:library:search',
    query: 'lumi:library:query',
    summary: 'lumi:library:summary',
    home: 'lumi:library:home'
  },
  settings: {
    get: 'lumi:settings:get',
    update: 'lumi:settings:update'
  },
  backup: {
    state: 'lumi:backup:state', create: 'lumi:backup:create', chooseDirectory: 'lumi:backup:choose-directory',
    delete: 'lumi:backup:delete', chooseRestore: 'lumi:backup:choose-restore', restore: 'lumi:backup:restore',
    openFolder: 'lumi:backup:open-folder'
  },
  transfer: {
    exportJson: 'lumi:transfer:export-json', exportCsv: 'lumi:transfer:export-csv',
    chooseImport: 'lumi:transfer:choose-import', applyImport: 'lumi:transfer:apply-import'
  },
  updates: {
    state: 'lumi:updates:state', check: 'lumi:updates:check', download: 'lumi:updates:download',
    install: 'lumi:updates:install', setDirty: 'lumi:updates:set-dirty'
  }
} as const
