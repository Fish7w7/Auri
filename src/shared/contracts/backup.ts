export type BackupType = 'manual' | 'auto' | 'before_restore' | 'before_import' | 'before_migration'

export interface BackupManifest {
  format: 'auri-backup' | 'lumi-backup'
  formatVersion: 1
  appVersion: string
  schemaVersion: number
  createdAt: string
  type: BackupType
  workCount: number
}

export interface BackupRecord {
  path: string
  fileName: string
  size: number
  createdAt: string
  type: BackupType
  workCount: number
}

export interface BackupPreview extends BackupRecord {
  appVersion: string
  schemaVersion: number
  includesSettings: boolean
  assetCount: number
}

export interface BackupState {
  directory: string
  directoryAvailable: boolean
  automatic: boolean
  frequency: 'daily' | 'weekly'
  retention: number
  backups: BackupRecord[]
}

export interface BackupApi {
  backup: {
    state(): Promise<BackupState>
    create(): Promise<BackupRecord>
    chooseDirectory(): Promise<BackupState | null>
    delete(request: { path: string }): Promise<void>
    chooseRestore(): Promise<BackupPreview | null>
    restore(request: { path: string }): Promise<void>
    openFolder(): Promise<void>
  }
}
