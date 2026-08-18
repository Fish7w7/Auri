import { z } from 'zod'
import type { DomainApi } from './domain'
import type { SettingsApi } from './settings'
import type { MetadataApi } from './metadata'
import type { CoverApi } from './covers'
import type { DataManagementApi } from './settings'
import type { UpdatesApi } from './updates'
import type { UrlMetadataApi } from './url-metadata'

export const dataPathsSchema = z.object({
  root: z.string(),
  database: z.string(),
  assets: z.string(),
  coverCache: z.string(),
  backups: z.string(),
  logs: z.string(),
  settings: z.string()
})

export const systemStatusSchema = z.object({
  appVersion: z.string(),
  backupFormatVersion: z.number().int().positive(),
  platform: z.object({
    name: z.string(),
    architecture: z.string(),
    label: z.string()
  }),
  runtime: z.object({
    electron: z.string(),
    node: z.string(),
    chrome: z.string()
  }),
  database: z.object({
    state: z.literal('ready'),
    schemaVersion: z.number().int().nonnegative(),
    sqliteVersion: z.string()
  }),
  paths: dataPathsSchema
})

export type DataPaths = z.infer<typeof dataPathsSchema>
export type SystemStatus = z.infer<typeof systemStatusSchema>

export interface StorageUsage {
  databaseBytes: number
  customCoversBytes: number
  coverCacheBytes: number
  backupsBytes: number
}

export interface LibraryIntegrityResult {
  healthy: boolean
  checkedAt: string
  summary: string
  quickCheck: string[]
  foreignKeyIssues: Array<{ table: string; parent: string; foreignKeyId: number }>
}

export interface SystemDiagnostics {
  status: SystemStatus
  storage: StorageUsage
  integrity: LibraryIntegrityResult | null
}

export interface LumiApi extends DomainApi, SettingsApi, MetadataApi, CoverApi, DataManagementApi, UpdatesApi, UrlMetadataApi {
  system: {
    getStatus(): Promise<SystemStatus>
    getDiagnostics(): Promise<SystemDiagnostics>
    checkIntegrity(): Promise<LibraryIntegrityResult>
    clearCoverCache(): Promise<StorageUsage>
    openDataFolder(): Promise<void>
    openBackupsFolder(): Promise<void>
    openLogsFolder(): Promise<void>
    copySystemInfo(): Promise<void>
    exportDiagnostic(): Promise<string | null>
  }
}
