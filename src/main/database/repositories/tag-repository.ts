import type Database from 'better-sqlite3'
import type { Tag } from '@shared/types/domain'

interface TagRow {
  id: string
  name: string
  normalized_name: string
  created_at: string
}

export class TagRepository {
  constructor(private readonly db: Database.Database) {}

  create(tag: Tag): Tag {
    this.db
      .prepare('INSERT INTO tags (id, name, normalized_name, created_at) VALUES (@id, @name, @normalizedName, @createdAt)')
      .run(tag)
    return tag
  }

  findByNormalizedName(normalizedName: string): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE normalized_name = ?').get(normalizedName) as
      | TagRow
      | undefined
    return row ? this.map(row) : null
  }

  findById(id: string): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined
    return row ? this.map(row) : null
  }

  listAll(): Tag[] {
    return (this.db.prepare('SELECT * FROM tags ORDER BY normalized_name').all() as TagRow[]).map((row) => this.map(row))
  }

  attachToWork(workId: string, tagId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id) VALUES (?, ?)').run(workId, tagId)
  }

  detachFromWork(workId: string, tagId: string): void {
    this.db.prepare('DELETE FROM work_tags WHERE work_id = ? AND tag_id = ?').run(workId, tagId)
  }

  listByWork(workId: string): Tag[] {
    return (
      this.db
        .prepare(`
          SELECT t.* FROM tags t JOIN work_tags wt ON wt.tag_id = t.id
          WHERE wt.work_id = ? ORDER BY t.normalized_name
        `)
        .all(workId) as TagRow[]
    ).map((row) => this.map(row))
  }

  detachAllFromWork(workId: string): void { this.db.prepare('DELETE FROM work_tags WHERE work_id = ?').run(workId) }

  private map(row: TagRow): Tag {
    return { id: row.id, name: row.name, normalizedName: row.normalized_name, createdAt: row.created_at }
  }
}
