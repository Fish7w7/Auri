import type Database from 'better-sqlite3'
import { MigrationRepository } from './migration-repository'

export interface DatabaseIntegrityDetails {
  quickCheck: string[]
  foreignKeyIssues: Array<{ table: string; parent: string; foreignKeyId: number }>
}

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
    const result = this.checkIntegrity()
    if (result.quickCheck.length !== 1 || result.quickCheck[0] !== 'ok' || result.foreignKeyIssues.length > 0) {
      throw new Error('A verificação de integridade do SQLite falhou.')
    }
  }

  checkIntegrity(): DatabaseIntegrityDetails {
    const quickRows = this.db.pragma('quick_check') as Array<Record<string, unknown>>
    const quickCheck = quickRows.map((row) => String(row.quick_check ?? Object.values(row)[0] ?? 'resultado desconhecido'))
    const foreignRows = this.db.pragma('foreign_key_check') as Array<Record<string, unknown>>
    const foreignKeyIssues = foreignRows.map((row) => ({
      table: String(row.table ?? 'desconhecida'),
      parent: String(row.parent ?? 'desconhecida'),
      foreignKeyId: Number(row.fkid ?? -1)
    }))
    return { quickCheck, foreignKeyIssues }
  }
}
