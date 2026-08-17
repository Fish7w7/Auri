import type Database from 'better-sqlite3'
import type { Collection } from '@shared/types/domain'

interface CollectionRow {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export class CollectionRepository {
  constructor(private readonly db: Database.Database) {}

  create(collection: Collection): Collection {
    this.db
      .prepare(`
        INSERT INTO collections (id, name, description, created_at, updated_at)
        VALUES (@id, @name, @description, @createdAt, @updatedAt)
      `)
      .run(collection)
    return collection
  }

  findById(id: string): Collection | null {
    const row = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as
      | CollectionRow
      | undefined
    return row ? this.map(row) : null
  }

  listAll(): Collection[] {
    return (this.db.prepare('SELECT * FROM collections ORDER BY name COLLATE NOCASE').all() as CollectionRow[]).map((row) => this.map(row))
  }

  update(collection: Collection): Collection {
    this.db.prepare('UPDATE collections SET name = @name, description = @description, updated_at = @updatedAt WHERE id = @id').run(collection)
    return collection
  }

  addWork(collectionId: string, workId: string, addedAt: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO collection_items (collection_id, work_id, added_at) VALUES (?, ?, ?)')
      .run(collectionId, workId, addedAt)
  }

  removeWork(collectionId: string, workId: string): void {
    this.db
      .prepare('DELETE FROM collection_items WHERE collection_id = ? AND work_id = ?')
      .run(collectionId, workId)
  }

  listByWork(workId: string): Collection[] {
    return (
      this.db
        .prepare(`
          SELECT c.* FROM collections c
          JOIN collection_items ci ON ci.collection_id = c.id
          WHERE ci.work_id = ? ORDER BY c.name
        `)
        .all(workId) as CollectionRow[]
    ).map((row) => this.map(row))
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM collections WHERE id = ?').run(id).changes > 0
  }

  private map(row: CollectionRow): Collection {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
