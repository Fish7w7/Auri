import type Database from 'better-sqlite3'

interface AppliedMigrationRow {
  version: number
  name: string
  applied_at: string
}

export class MigrationRepository {
  constructor(private readonly db: Database.Database) {}

  ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `)
  }

  tableExists(): boolean {
    return this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get() !== undefined
  }

  listApplied(): AppliedMigrationRow[] {
    return this.db
      .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
      .all() as AppliedMigrationRow[]
  }

  markApplied(version: number, name: string, appliedAt: string): void {
    this.db
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      )
      .run(version, name, appliedAt)
  }

  getCurrentVersion(): number {
    if (!this.tableExists()) return 0
    const row = this.db
      .prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations')
      .get() as { version: number }

    return row.version
  }
}
