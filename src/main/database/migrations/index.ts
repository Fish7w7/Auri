import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'
import { createInitialSchemaMigration } from './001-initial-schema'
import { createHiddenFromHomeMigration } from './002-hidden-from-home'
import { createSourceSearchMigration } from './003-source-search'

export const SUPPORTED_SCHEMA_VERSION = 3

export function createMigrations(db: Database.Database): readonly Migration[] {
  return [
    createInitialSchemaMigration(db),
    createHiddenFromHomeMigration(db),
    createSourceSearchMigration(db)
  ]
}
