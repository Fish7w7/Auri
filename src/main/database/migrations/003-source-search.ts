import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'

interface SourceSearchRow {
  id: string
  name: string | null
  domain: string
}

export function createSourceSearchMigration(db: Database.Database): Migration {
  return {
    version: 3,
    name: '003_source_search',
    up() {
      db.exec(`
        ALTER TABLE sources ADD COLUMN normalized_name TEXT;
        ALTER TABLE sources ADD COLUMN normalized_domain TEXT NOT NULL DEFAULT '';
      `)

      const sources = db.prepare('SELECT id, name, domain FROM sources').all() as SourceSearchRow[]
      const update = db.prepare(`
        UPDATE sources
        SET normalized_name = ?, normalized_domain = ?
        WHERE id = ?
      `)
      for (const source of sources) {
        update.run(
          source.name ? normalizeSearchText(source.name) : null,
          normalizeSearchText(source.domain),
          source.id
        )
      }
    }
  }
}
