import type Database from 'better-sqlite3'
import type { ExternalRef } from '@shared/types/domain'

interface ExternalRefRow {
  id: string
  work_id: string
  provider: string
  external_id: string
  canonical_url: string | null
  last_synced_at: string | null
  created_at: string
}

export class ExternalRefRepository {
  constructor(private readonly db: Database.Database) {}

  create(reference: ExternalRef): ExternalRef {
    this.db
      .prepare(`
        INSERT INTO external_refs (
          id, work_id, provider, external_id, canonical_url, last_synced_at, created_at
        ) VALUES (
          @id, @workId, @provider, @externalId, @canonicalUrl, @lastSyncedAt, @createdAt
        )
      `)
      .run(reference)
    return reference
  }

  findByProviderExternalId(provider: string, externalId: string): ExternalRef | null {
    const row = this.db
      .prepare('SELECT * FROM external_refs WHERE provider = ? AND external_id = ?')
      .get(provider, externalId) as ExternalRefRow | undefined
    return row ? this.map(row) : null
  }

  listByWork(workId: string): ExternalRef[] {
    return (this.db.prepare('SELECT * FROM external_refs WHERE work_id = ?').all(workId) as ExternalRefRow[]).map(
      (row) => this.map(row)
    )
  }

  findByWorkAndProvider(workId: string, provider: string): ExternalRef | null {
    const row = this.db.prepare('SELECT * FROM external_refs WHERE work_id = ? AND provider = ? LIMIT 1').get(workId, provider) as ExternalRefRow | undefined
    return row ? this.map(row) : null
  }

  update(reference: ExternalRef): ExternalRef {
    this.db.prepare(`UPDATE external_refs SET canonical_url = @canonicalUrl,
      last_synced_at = @lastSyncedAt WHERE id = @id`).run(reference)
    return reference
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM external_refs WHERE id = ?').run(id).changes > 0
  }

  private map(row: ExternalRefRow): ExternalRef {
    return {
      id: row.id,
      workId: row.work_id,
      provider: row.provider,
      externalId: row.external_id,
      canonicalUrl: row.canonical_url,
      lastSyncedAt: row.last_synced_at,
      createdAt: row.created_at
    }
  }
}
