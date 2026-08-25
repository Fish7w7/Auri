import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createMigrations } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { TestLogger } from '../helpers/test-logger'

describe('schema SQLite atual', () => {
  let db: Database.Database | undefined

  afterEach(() => db?.close())

  it('migra schema 0 para 2 e cria todas as tabelas', () => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const runner = new MigrationRunner(db, new TestLogger(), createMigrations(db))

    expect(runner.run()).toBe(2)

    const tables = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name)
    )
    expect(tables).toEqual(
      new Set([
        'schema_migrations',
        'works',
        'aliases',
        'external_refs',
        'work_creators',
        'genres',
        'work_genres',
        'tags',
        'work_tags',
        'collections',
        'collection_items',
        'sources',
        'reading_history',
        'metadata_overrides'
      ])
    )
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('cria os índices obrigatórios e não reaplica a migration', () => {
    db = new Database(':memory:')
    const runner = new MigrationRunner(db, new TestLogger(), createMigrations(db))
    expect(runner.run()).toBe(2)
    expect(runner.run()).toBe(2)

    const indexes = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map(
        (row) => row.name
      )
    )
    for (const name of [
      'idx_works_normalized_title',
      'idx_works_user_status',
      'idx_works_last_read_at',
      'idx_works_created_at',
      'idx_works_deleted_at',
      'idx_works_home_visibility',
      'idx_aliases_normalized_name',
      'idx_work_creators_normalized_name',
      'idx_sources_work_id',
      'idx_sources_domain',
      'idx_sources_last_used_at',
      'idx_sources_one_preferred',
      'idx_reading_history_work_occurred',
      'idx_external_refs_work_id',
      'idx_work_genres_genre_id',
      'idx_work_tags_tag_id',
      'idx_collection_items_work_id'
    ]) {
      expect(indexes.has(name), name).toBe(true)
    }
  })
})

