import type Database from 'better-sqlite3'
import type { Genre } from '@shared/types/domain'

interface GenreRow {
  id: string
  name: string
  normalized_name: string
}

export class GenreRepository {
  constructor(private readonly db: Database.Database) {}

  create(genre: Genre): Genre {
    this.db
      .prepare('INSERT INTO genres (id, name, normalized_name) VALUES (@id, @name, @normalizedName)')
      .run(genre)
    return genre
  }

  findByNormalizedName(normalizedName: string): Genre | null {
    const row = this.db.prepare('SELECT * FROM genres WHERE normalized_name = ?').get(normalizedName) as
      | GenreRow
      | undefined
    return row ? { id: row.id, name: row.name, normalizedName: row.normalized_name } : null
  }

  findById(id: string): Genre | null {
    const row = this.db.prepare('SELECT * FROM genres WHERE id = ?').get(id) as GenreRow | undefined
    return row ? this.map(row) : null
  }

  listAll(): Genre[] {
    return (this.db.prepare('SELECT * FROM genres ORDER BY normalized_name').all() as GenreRow[]).map((row) => this.map(row))
  }

  attachToWork(workId: string, genreId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO work_genres (work_id, genre_id) VALUES (?, ?)').run(workId, genreId)
  }

  detachFromWork(workId: string, genreId: string): void {
    this.db.prepare('DELETE FROM work_genres WHERE work_id = ? AND genre_id = ?').run(workId, genreId)
  }

  listByWork(workId: string): Genre[] {
    return (
      this.db
        .prepare(`
          SELECT g.* FROM genres g
          JOIN work_genres wg ON wg.genre_id = g.id
          WHERE wg.work_id = ? ORDER BY g.normalized_name
        `)
        .all(workId) as GenreRow[]
    ).map((row) => this.map(row))
  }

  detachAllFromWork(workId: string): void { this.db.prepare('DELETE FROM work_genres WHERE work_id = ?').run(workId) }

  private map(row: GenreRow): Genre { return { id: row.id, name: row.name, normalizedName: row.normalized_name } }
}
