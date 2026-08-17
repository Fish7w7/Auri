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
  database: z.object({
    state: z.literal('ready'),
    schemaVersion: z.number().int().nonnegative(),
    sqliteVersion: z.string()
  }),
  paths: dataPathsSchema
})

export type DataPaths = z.infer<typeof dataPathsSchema>
export type SystemStatus = z.infer<typeof systemStatusSchema>

export interface LumiApi extends DomainApi, SettingsApi, MetadataApi, CoverApi, DataManagementApi, UpdatesApi, UrlMetadataApi {
  system: {
    getStatus(): Promise<SystemStatus>
  }
}
