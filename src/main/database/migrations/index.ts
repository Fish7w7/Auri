import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'
import { createInitialSchemaMigration } from './001-initial-schema'

export const SUPPORTED_SCHEMA_VERSION = 1

export function createMigrations(db: Database.Database): readonly Migration[] {
  return [createInitialSchemaMigration(db)]
}
