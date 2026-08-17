import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'

export function createInitialSchemaMigration(db: Database.Database): Migration {
  return {
    version: 1,
    name: '001_initial_schema',
    up() {
      db.exec(`
        CREATE TABLE works (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          normalized_title TEXT NOT NULL,
          media_type TEXT NOT NULL,
          user_status TEXT NOT NULL,
          publication_status TEXT,
          description TEXT,
          country_code TEXT,
          start_date TEXT,
          end_date TEXT,
          last_read_chapter_label TEXT,
          last_read_chapter_number REAL,
          last_read_at TEXT,
          rating REAL,
          favorite INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          last_read_note TEXT,
          cover_type TEXT NOT NULL DEFAULT 'none',
          cover_source_url TEXT,
          cover_custom_path TEXT,
          cover_updated_at TEXT,
          metadata_updated_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        ) STRICT;

        CREATE TABLE aliases (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          kind TEXT,
          source TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          UNIQUE (work_id, normalized_name)
        ) STRICT;

        CREATE TABLE external_refs (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          external_id TEXT NOT NULL,
          canonical_url TEXT,
          last_synced_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          UNIQUE (provider, external_id)
        ) STRICT;

        CREATE TABLE work_creators (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          role TEXT NOT NULL,
          source TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          UNIQUE (work_id, normalized_name, role)
        ) STRICT;

        CREATE TABLE genres (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL UNIQUE
        ) STRICT;

        CREATE TABLE work_genres (
          work_id TEXT NOT NULL,
          genre_id TEXT NOT NULL,
          PRIMARY KEY (work_id, genre_id),
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE work_tags (
          work_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (work_id, tag_id),
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE collections (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;

        CREATE TABLE collection_items (
          collection_id TEXT NOT NULL,
          work_id TEXT NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (collection_id, work_id),
          FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          name TEXT,
          domain TEXT NOT NULL,
          language TEXT,
          series_url TEXT,
          last_read_url TEXT,
          translator_group TEXT,
          status TEXT NOT NULL,
          is_preferred INTEGER NOT NULL DEFAULT 0,
          last_used_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE reading_history (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL,
          source_id TEXT,
          event_type TEXT NOT NULL,
          old_chapter_label TEXT,
          old_chapter_number REAL,
          new_chapter_label TEXT,
          new_chapter_number REAL,
          source_name_snapshot TEXT,
          source_domain_snapshot TEXT,
          note TEXT,
          reverts_history_id TEXT,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
          FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL,
          FOREIGN KEY (reverts_history_id) REFERENCES reading_history(id) ON DELETE SET NULL
        ) STRICT;

        CREATE TABLE metadata_overrides (
          work_id TEXT NOT NULL,
          field_key TEXT NOT NULL,
          locked_at TEXT NOT NULL,
          PRIMARY KEY (work_id, field_key),
          FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
        ) STRICT;

        CREATE INDEX idx_works_normalized_title ON works(normalized_title);
        CREATE INDEX idx_works_user_status ON works(user_status);
        CREATE INDEX idx_works_last_read_at ON works(last_read_at);
        CREATE INDEX idx_works_created_at ON works(created_at);
        CREATE INDEX idx_works_deleted_at ON works(deleted_at);
        CREATE INDEX idx_aliases_normalized_name ON aliases(normalized_name);
        CREATE INDEX idx_work_creators_normalized_name ON work_creators(normalized_name);
        CREATE INDEX idx_sources_work_id ON sources(work_id);
        CREATE INDEX idx_sources_domain ON sources(domain);
        CREATE INDEX idx_sources_last_used_at ON sources(last_used_at);
        CREATE UNIQUE INDEX idx_sources_one_preferred
          ON sources(work_id) WHERE is_preferred = 1;
        CREATE INDEX idx_reading_history_work_occurred
          ON reading_history(work_id, occurred_at);
        CREATE INDEX idx_external_refs_work_id ON external_refs(work_id);
        CREATE INDEX idx_work_genres_genre_id ON work_genres(genre_id);
        CREATE INDEX idx_work_tags_tag_id ON work_tags(tag_id);
        CREATE INDEX idx_collection_items_work_id ON collection_items(work_id);
      `)
    }
  }
}

