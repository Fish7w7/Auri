import type Database from 'better-sqlite3'
import type { Creator } from '@shared/types/domain'

interface CreatorRow {
  id: string
  work_id: string
  name: string
  normalized_name: string
  role: string
  source: string | null
  created_at: string
}

export class CreatorRepository {
  constructor(private readonly db: Database.Database) {}

  create(creator: Creator): Creator {
    this.db
      .prepare(`
        INSERT INTO work_creators (id, work_id, name, normalized_name, role, source, created_at)
        VALUES (@id, @workId, @name, @normalizedName, @role, @source, @createdAt)
      `)
      .run(creator)
    return creator
  }

  listByWork(workId: string): Creator[] {
    return (this.db.prepare('SELECT * FROM work_creators WHERE work_id = ?').all(workId) as CreatorRow[]).map(
      (row) => ({
        id: row.id,
        workId: row.work_id,
        name: row.name,
        normalizedName: row.normalized_name,
        role: row.role,
        source: row.source,
        createdAt: row.created_at
      })
    )
  }

  findById(id: string): Creator | null {
    const row = this.db.prepare('SELECT * FROM work_creators WHERE id = ?').get(id) as CreatorRow | undefined
    return row ? this.map(row) : null
  }

  findDuplicate(workId: string, normalizedName: string, role: string, exceptId?: string): Creator | null {
    const row = this.db.prepare(`SELECT * FROM work_creators WHERE work_id = ? AND normalized_name = ? AND role = ? ${exceptId ? 'AND id <> ?' : ''}`)
      .get(...(exceptId ? [workId, normalizedName, role, exceptId] : [workId, normalizedName, role])) as CreatorRow | undefined
    return row ? this.map(row) : null
  }

  update(creator: Creator): Creator {
    this.db.prepare(`UPDATE work_creators SET name = @name, normalized_name = @normalizedName,
      role = @role, source = @source WHERE id = @id`).run(creator)
    return creator
  }

  deleteByWork(workId: string): void {
    this.db.prepare('DELETE FROM work_creators WHERE work_id = ?').run(workId)
  }

  deleteByWorkAndSource(workId: string, source: string): void {
    this.db.prepare('DELETE FROM work_creators WHERE work_id = ? AND source = ?').run(workId, source)
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM work_creators WHERE id = ?').run(id).changes > 0
  }

  private map(row: CreatorRow): Creator {
    return { id: row.id, workId: row.work_id, name: row.name, normalizedName: row.normalized_name,
      role: row.role, source: row.source, createdAt: row.created_at }
  }
}
