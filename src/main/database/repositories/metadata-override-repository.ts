import type Database from 'better-sqlite3'
import type { MetadataOverride } from '@shared/types/domain'

interface OverrideRow {
  work_id: string
  field_key: string
  locked_at: string
}

export class MetadataOverrideRepository {
  constructor(private readonly db: Database.Database) {}

  set(override: MetadataOverride): MetadataOverride {
    this.db
      .prepare(`
        INSERT INTO metadata_overrides (work_id, field_key, locked_at)
        VALUES (@workId, @fieldKey, @lockedAt)
        ON CONFLICT(work_id, field_key) DO UPDATE SET locked_at = excluded.locked_at
      `)
      .run(override)
    return override
  }

  listByWork(workId: string): MetadataOverride[] {
    return (
      this.db.prepare('SELECT * FROM metadata_overrides WHERE work_id = ?').all(workId) as OverrideRow[]
    ).map((row) => ({ workId: row.work_id, fieldKey: row.field_key, lockedAt: row.locked_at }))
  }

  remove(workId: string, fieldKey: string): void {
    this.db
      .prepare('DELETE FROM metadata_overrides WHERE work_id = ? AND field_key = ?')
      .run(workId, fieldKey)
  }
}

