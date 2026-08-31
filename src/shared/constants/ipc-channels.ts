export const IPC_CHANNELS = {
  desktopCommands: {
    openWork: 'auri:desktop-command:open-work',
    openAddWork: 'auri:desktop-command:open-add-work',
    workChanged: 'auri:desktop-command:work-changed'
  },
  bulk: {
    setStatus: 'auri:bulk:set-status',
    setFavorite: 'auri:bulk:set-favorite',
    setHomeVisibility: 'auri:bulk:set-home-visibility',
    addTag: 'auri:bulk:add-tag',
    removeTag: 'auri:bulk:remove-tag',
    addCollection: 'auri:bulk:add-collection',
    removeCollection: 'auri:bulk:remove-collection',
    moveToTrash: 'auri:bulk:move-to-trash'
  },
  system: {
    getStatus: 'auri:system:get-status',
    getDiagnostics: 'auri:system:get-diagnostics',
    checkIntegrity: 'auri:system:check-integrity',
    clearCoverCache: 'auri:system:clear-cover-cache',
    openDataFolder: 'auri:system:open-data-folder',
    openBackupsFolder: 'auri:system:open-backups-folder',
    openLogsFolder: 'auri:system:open-logs-folder',
    copySystemInfo: 'auri:system:copy-info',
    exportDiagnostic: 'auri:system:export-diagnostic'
  },
  works: {
    create: 'auri:works:create',
    createDetailed: 'auri:works:create-detailed',
    get: 'auri:works:get',
    getDetails: 'auri:works:get-details',
    update: 'auri:works:update',
    updateDetailed: 'auri:works:update-detailed',
    list: 'auri:works:list',
    trash: 'auri:works:trash',
    listTrash: 'auri:works:list-trash',
    restore: 'auri:works:restore',
    deletePermanently: 'auri:works:delete-permanently'
  },
  progress: {
    get: 'auri:progress:get',
    update: 'auri:progress:update',
    increment: 'auri:progress:increment',
    decrement: 'auri:progress:decrement',
    undo: 'auri:progress:undo',
    history: 'auri:progress:history'
  },
  sources: {
    create: 'auri:sources:create',
    update: 'auri:sources:update',
    list: 'auri:sources:list',
    setPreferred: 'auri:sources:set-preferred',
    archive: 'auri:sources:archive',
    markUnavailable: 'auri:sources:mark-unavailable',
    reactivate: 'auri:sources:reactivate',
    markUsed: 'auri:sources:mark-used',
    deletePermanently: 'auri:sources:delete-permanently'
  },
  aliases: {
    list: 'auri:aliases:list', create: 'auri:aliases:create', update: 'auri:aliases:update', delete: 'auri:aliases:delete'
  },
  creators: {
    list: 'auri:creators:list', create: 'auri:creators:create', update: 'auri:creators:update', delete: 'auri:creators:delete'
  },
  genres: {
    list: 'auri:genres:list', create: 'auri:genres:create', addToWork: 'auri:genres:add-to-work', removeFromWork: 'auri:genres:remove-from-work'
  },
  tags: {
    list: 'auri:tags:list', create: 'auri:tags:create', addToWork: 'auri:tags:add-to-work', removeFromWork: 'auri:tags:remove-from-work'
  },
  collections: {
    list: 'auri:collections:list', create: 'auri:collections:create', update: 'auri:collections:update', delete: 'auri:collections:delete', addWork: 'auri:collections:add-work', removeWork: 'auri:collections:remove-work', listForWork: 'auri:collections:list-for-work'
  },
  assets: {
    selectCover: 'auri:assets:select-cover', setRemoteCover: 'auri:assets:set-remote-cover', removeCover: 'auri:assets:remove-cover', readCover: 'auri:assets:read-cover'
  },
  shell: {
    openExternal: 'auri:shell:open-external'
  },
  metadata: {
    search: 'auri:metadata:search', review: 'auri:metadata:review', import: 'auri:metadata:import',
    previewRefresh: 'auri:metadata:preview-refresh', applyRefresh: 'auri:metadata:apply-refresh', cancel: 'auri:metadata:cancel'
  },
  urlMetadata: {
    analyze: 'auri:url-metadata:analyze',
    checkDuplicate: 'auri:url-metadata:check-duplicate'
  },
  covers: {
    get: 'auri:covers:get', preview: 'auri:covers:preview', refresh: 'auri:covers:refresh', clearWork: 'auri:covers:clear-work',
    clearAll: 'auri:covers:clear-all', usage: 'auri:covers:usage'
  },
  library: {
    search: 'auri:library:search',
    query: 'auri:library:query',
    summary: 'auri:library:summary',
    home: 'auri:library:home'
  },
  settings: {
    get: 'auri:settings:get',
    update: 'auri:settings:update'
  },
  backup: {
    state: 'auri:backup:state', create: 'auri:backup:create', chooseDirectory: 'auri:backup:choose-directory',
    delete: 'auri:backup:delete', chooseRestore: 'auri:backup:choose-restore', restore: 'auri:backup:restore',
    openFolder: 'auri:backup:open-folder'
  },
  transfer: {
    exportJson: 'auri:transfer:export-json', exportCsv: 'auri:transfer:export-csv',
    chooseImport: 'auri:transfer:choose-import', applyImport: 'auri:transfer:apply-import'
  },
  updates: {
    state: 'auri:updates:state', check: 'auri:updates:check', download: 'auri:updates:download',
    install: 'auri:updates:install', setDirty: 'auri:updates:set-dirty'
  }
} as const
