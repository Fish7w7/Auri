import type Database from 'better-sqlite3'
import type { Alias } from '@shared/types/domain'

interface AliasRow {
  id: string
  work_id: string
  name: string
  normalized_name: string
  kind: string | null
  source: string | null
  created_at: string
}

export class AliasRepository {
  constructor(private readonly db: Database.Database) {}

  create(alias: Alias): Alias {
    this.db
      .prepare(`
        INSERT INTO aliases (id, work_id, name, normalized_name, kind, source, created_at)
        VALUES (@id, @workId, @name, @normalizedName, @kind, @source, @createdAt)
      `)
      .run(alias)
    return alias
  }

  findByWorkAndNormalizedName(workId: string, normalizedName: string): Alias | null {
    const row = this.db
      .prepare('SELECT * FROM aliases WHERE work_id = ? AND normalized_name = ?')
      .get(workId, normalizedName) as AliasRow | undefined
    return row ? this.map(row) : null
  }

  listByWork(workId: string): Alias[] {
    return (this.db.prepare('SELECT * FROM aliases WHERE work_id = ? ORDER BY created_at').all(workId) as AliasRow[]).map(
      (row) => this.map(row)
    )
  }

  findById(id: string): Alias | null {
    const row = this.db.prepare('SELECT * FROM aliases WHERE id = ?').get(id) as AliasRow | undefined
    return row ? this.map(row) : null
  }

  update(alias: Alias): Alias {
    this.db.prepare(`UPDATE aliases SET name = @name, normalized_name = @normalizedName,
      kind = @kind, source = @source WHERE id = @id`).run(alias)
    return alias
  }

  deleteByWork(workId: string): void {
    this.db.prepare('DELETE FROM aliases WHERE work_id = ?').run(workId)
  }

  deleteByWorkAndSource(workId: string, source: string): void {
    this.db.prepare('DELETE FROM aliases WHERE work_id = ? AND source = ?').run(workId, source)
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM aliases WHERE id = ?').run(id).changes > 0
  }

  private map(row: AliasRow): Alias {
    return {
      id: row.id,
      workId: row.work_id,
      name: row.name,
      normalizedName: row.normalized_name,
      kind: row.kind,
      source: row.source,
      createdAt: row.created_at
    }
  }
}
