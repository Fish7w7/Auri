import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { DomainError } from '@shared/errors/domain-error'
import type { Logger } from '../../logging/logger'

export interface DatabaseConnection {
  readonly db: Database.Database
  close(): void
}

export function assertDatabaseSchemaSupported(databasePath: string, supportedSchema: number): void {
  if (!existsSync(databasePath)) return
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const hasMigrations = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get() !== undefined
    if (!hasMigrations) return
    const databaseSchema = (db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version
    if (databaseSchema > supportedSchema) {
      throw new DomainError('DATABASE_SCHEMA_TOO_NEW', `Esta biblioteca foi atualizada por uma versão mais recente do Lumi. Banco: schema ${databaseSchema}. Esta versão suporta até: schema ${supportedSchema}.`, { databaseSchema, supportedSchema })
    }
  } finally { db.close() }
}

export function openDatabase(databasePath: string, logger: Logger): DatabaseConnection {
  let db: Database.Database | undefined

  try {
    db = new Database(databasePath)
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')

    logger.info('database', 'Banco de dados aberto.', { event: 'database.opened' })

    return {
      db,
      close() {
        if (db?.open) {
          db.close()
          logger.info('database', 'Banco de dados fechado.', { event: 'database.closed' })
        }
      }
    }
  } catch (error) {
    if (db?.open) db.close()
    logger.error('database', 'Não foi possível abrir o banco de dados.', {
      event: 'database.open_failed',
      errorCode: error instanceof Error ? error.name : 'UNKNOWN'
    })
    throw error
  }
}
