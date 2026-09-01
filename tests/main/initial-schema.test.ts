import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createMigrations } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { TestLogger } from '../fixtures/test-logger'

describe('schema SQLite atual', () => {
  let db: Database.Database | undefined

  afterEach(() => db?.close())

  it('migra schema 0 para 3 e cria todas as tabelas', () => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const runner = new MigrationRunner(db, new TestLogger(), createMigrations(db))

    expect(runner.run()).toBe(3)

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
    expect(runner.run()).toBe(3)
    expect(runner.run()).toBe(3)

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

  it('migra uma base existente e normaliza nome e domínio das fontes no backfill', () => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    const migrations = createMigrations(db)
    expect(new MigrationRunner(db, new TestLogger(), migrations.slice(0, 2)).run()).toBe(2)
    db.prepare(`INSERT INTO works (
      id, title, normalized_title, media_type, user_status, cover_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('work', 'Obra', 'obra', 'manga', 'reading', 'none', '2026-08-01', '2026-08-01')
    db.prepare(`INSERT INTO sources (
      id, work_id, name, domain, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('source', 'work', 'Leitor Ágil', 'MangaDex.ORG', 'archived', '2026-08-01', '2026-08-01')

    expect(new MigrationRunner(db, new TestLogger(), migrations).run()).toBe(3)
    expect(db.prepare('SELECT normalized_name, normalized_domain FROM sources WHERE id = ?').get('source')).toEqual({
      normalized_name: 'leitor agil',
      normalized_domain: 'mangadex org'
    })
  })
})
