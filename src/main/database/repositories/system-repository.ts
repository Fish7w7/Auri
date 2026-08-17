import type Database from 'better-sqlite3'
import { MigrationRepository } from './migration-repository'

export class SystemRepository {
  private readonly migrations: MigrationRepository

  constructor(private readonly db: Database.Database) {
    this.migrations = new MigrationRepository(db)
  }

  getSchemaVersion(): number {
    return this.migrations.getCurrentVersion()
  }

  getSqliteVersion(): string {
    const row = this.db.prepare('SELECT sqlite_version() AS version').get() as {
      version: string
    }
    return row.version
  }

  assertHealthy(): void {
    const row = this.db.pragma('quick_check', { simple: true }) as string
    if (row !== 'ok') {
      throw new Error('A verificação de integridade do SQLite falhou.')
    }
  }
}

