import type Database from 'better-sqlite3'
import type { Source } from '@shared/types/domain'

interface SourceRow {
  id: string
  work_id: string
  name: string | null
  domain: string
  language: string | null
  series_url: string | null
  last_read_url: string | null
  translator_group: string | null
  status: Source['status']
  is_preferred: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

const SOURCE_COLUMNS = `id, work_id, name, domain, language, series_url, last_read_url,
  translator_group, status, is_preferred, last_used_at, created_at, updated_at`

export class SourceRepository {
  constructor(private readonly db: Database.Database) {}

  create(source: Source): Source {
    this.db
      .prepare(`
        INSERT INTO sources (${SOURCE_COLUMNS}) VALUES (
          @id, @workId, @name, @domain, @language, @seriesUrl, @lastReadUrl,
          @translatorGroup, @status, @isPreferred, @lastUsedAt, @createdAt, @updatedAt
        )
      `)
      .run(this.params(source))
    return source
  }

  findById(id: string): Source | null {
    const row = this.db.prepare(`SELECT ${SOURCE_COLUMNS} FROM sources WHERE id = ?`).get(id) as
      | SourceRow
      | undefined
    return row ? this.map(row) : null
  }

  listByWork(workId: string): Source[] {
    return this.mapMany(
      this.db
        .prepare(`SELECT ${SOURCE_COLUMNS} FROM sources WHERE work_id = ? ORDER BY is_preferred DESC, created_at`)
        .all(workId) as SourceRow[]
    )
  }

  update(source: Source): Source {
    this.db
      .prepare(`
        UPDATE sources SET
          name = @name, domain = @domain, language = @language,
          series_url = @seriesUrl, last_read_url = @lastReadUrl,
          translator_group = @translatorGroup, status = @status,
          is_preferred = @isPreferred, last_used_at = @lastUsedAt,
          updated_at = @updatedAt
        WHERE id = @id
      `)
      .run(this.params(source))
    return source
  }

  clearPreferred(workId: string, updatedAt: string): void {
    this.db
      .prepare('UPDATE sources SET is_preferred = 0, updated_at = ? WHERE work_id = ? AND is_preferred = 1')
      .run(updatedAt, workId)
  }

  setPreferred(id: string, updatedAt: string): void {
    this.db
      .prepare('UPDATE sources SET is_preferred = 1, updated_at = ? WHERE id = ?')
      .run(updatedAt, id)
  }

  archive(id: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE sources SET status = 'archived', is_preferred = 0, updated_at = ? WHERE id = ?")
      .run(updatedAt, id)
  }

  markUnavailable(id: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE sources SET status = 'unavailable', updated_at = ? WHERE id = ?")
      .run(updatedAt, id)
  }

  touchLastUsed(id: string, lastUsedAt: string): void {
    this.db
      .prepare('UPDATE sources SET last_used_at = ?, updated_at = ? WHERE id = ?')
      .run(lastUsedAt, lastUsedAt, id)
  }

  deletePermanently(id: string): boolean {
    return this.db.prepare('DELETE FROM sources WHERE id = ?').run(id).changes > 0
  }

  findLastUsedByWork(workId: string): Source | null {
    const row = this.db
      .prepare(`
        SELECT ${SOURCE_COLUMNS} FROM sources
        WHERE work_id = ? AND last_used_at IS NOT NULL
        ORDER BY last_used_at DESC LIMIT 1
      `)
      .get(workId) as SourceRow | undefined
    return row ? this.map(row) : null
  }

  private params(source: Source): Record<string, unknown> {
    return {
      id: source.id,
      workId: source.workId,
      name: source.name,
      domain: source.domain,
      language: source.language,
      seriesUrl: source.seriesUrl,
      lastReadUrl: source.lastReadUrl,
      translatorGroup: source.translatorGroup,
      status: source.status,
      isPreferred: source.isPreferred ? 1 : 0,
      lastUsedAt: source.lastUsedAt,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    }
  }

  private map(row: SourceRow): Source {
    return {
      id: row.id,
      workId: row.work_id,
      name: row.name,
      domain: row.domain,
      language: row.language,
      seriesUrl: row.series_url,
      lastReadUrl: row.last_read_url,
      translatorGroup: row.translator_group,
      status: row.status,
      isPreferred: row.is_preferred === 1,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapMany(rows: SourceRow[]): Source[] {
    return rows.map((row) => this.map(row))
  }
}

