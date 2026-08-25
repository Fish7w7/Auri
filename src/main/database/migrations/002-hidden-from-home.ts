import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'

export function createHiddenFromHomeMigration(db: Database.Database): Migration {
  return {
    version: 2,
    name: '002_hidden_from_home',
    up() {
      db.exec(`
        ALTER TABLE works
        ADD COLUMN hidden_from_home INTEGER NOT NULL DEFAULT 0
          CHECK (hidden_from_home IN (0, 1));

        CREATE INDEX idx_works_home_visibility
          ON works(hidden_from_home, deleted_at, user_status);
      `)
    }
  }
}
