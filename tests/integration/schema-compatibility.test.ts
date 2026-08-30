import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertDatabaseSchemaSupported,
  inspectDatabaseSchemaCompatibility,
  openDatabase
} from '@main/database/connection/database-connection'
import { createMigrations, SUPPORTED_SCHEMA_VERSION } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { TestLogger } from '../helpers/test-logger'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function databasePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'auri-schema-compatibility-'))
  roots.push(root)
  return join(root, 'library.sqlite')
}

describe('compatibilidade do bootstrap de banco', () => {
  it('migra schema menor e aceita schema 3 no runtime 1.9.0', () => {
    const path = databasePath()
    const db = new Database(path)
    const migrations = createMigrations(db)
    expect(migrations.at(-1)?.version).toBe(SUPPORTED_SCHEMA_VERSION)
    expect(new MigrationRunner(db, new TestLogger(), migrations.slice(0, 2)).run()).toBe(2)
    expect(inspectDatabaseSchemaCompatibility(path, SUPPORTED_SCHEMA_VERSION)).toMatchObject({ databaseSchema: 2, compatibility: 'older' })
    expect(new MigrationRunner(db, new TestLogger(), migrations).run()).toBe(3)
    db.close()

    expect(() => assertDatabaseSchemaSupported(path, SUPPORTED_SCHEMA_VERSION)).not.toThrow()
    expect(inspectDatabaseSchemaCompatibility(path, SUPPORTED_SCHEMA_VERSION)).toEqual({ databaseSchema: 3, supportedSchema: 3, compatibility: 'current' })
    const connection = openDatabase(path, new TestLogger())
    connection.close()
  })

  it.each([4, 999])('bloqueia schema %s por leitura mínima e preserva o arquivo', (futureSchema) => {
    const path = databasePath()
    const db = new Database(path)
    db.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;
      INSERT INTO schema_migrations VALUES (${futureSchema}, 'future', '2026-08-30');
      CREATE TABLE preserved (value TEXT NOT NULL) STRICT;
      INSERT INTO preserved VALUES ('intacto');
    `)
    db.close()

    expect(inspectDatabaseSchemaCompatibility(path, SUPPORTED_SCHEMA_VERSION)).toMatchObject({ databaseSchema: futureSchema, compatibility: 'newer' })
    expect(() => assertDatabaseSchemaSupported(path, SUPPORTED_SCHEMA_VERSION)).toThrowError(expect.objectContaining({
      code: 'DATABASE_SCHEMA_TOO_NEW',
      details: expect.objectContaining({ databaseSchema: futureSchema, supportedSchema: 3 })
    }))
    const unchanged = new Database(path, { readonly: true, fileMustExist: true })
    expect(unchanged.prepare('SELECT value FROM preserved').pluck().get()).toBe('intacto')
    expect(unchanged.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(futureSchema)
    unchanged.close()
  })
})
