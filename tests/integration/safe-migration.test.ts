import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataPaths } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import type { Migration } from '@shared/types/database'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { runMigrationsSafely } from '@main/database/migrations/safe-migration-runner'
import { BackupService } from '@main/services/backup/backup-service'
import { SettingsService } from '@main/services/settings-service'
import { assertDatabaseSchemaSupported } from '@main/database/connection/database-connection'
import { TestLogger } from '../helpers/test-logger'

const roots: string[] = []
const databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

const migration1 = (db: Database.Database): Migration => ({ version: 1, name: 'base', up: () => db.exec('CREATE TABLE works (id TEXT PRIMARY KEY) STRICT') })

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'lumi-migration-test-')); roots.push(root)
  const paths: DataPaths = { root, database: join(root, 'data', 'library.sqlite'), assets: join(root, 'assets'), coverCache: join(root, 'cache', 'covers'), backups: join(root, 'backups'), logs: join(root, 'logs'), settings: join(root, 'settings.json') }
  for (const directory of [join(root, 'data'), paths.assets, paths.coverCache, paths.backups, paths.logs]) mkdirSync(directory, { recursive: true })
  const db = new Database(paths.database); databases.push(db)
  new MigrationRunner(db, new TestLogger(), [migration1(db)]).run()
  const backups = new BackupService(db, paths, new SettingsService(paths.settings, new TestLogger()), new TestLogger(), '0.2.0', 2)
  return { db, paths, backups }
}

describe('migrations seguras', () => {
  it('recusa schema mais novo sem executar ou alterar dados', () => {
    const root = mkdtempSync(join(tmpdir(), 'lumi-newer-schema-')); roots.push(root)
    const databasePath = join(root, 'library.sqlite')
    const db = new Database(databasePath); databases.push(db)
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT; INSERT INTO schema_migrations VALUES (2, 'future', '2026-08-17'); CREATE TABLE preserved (value TEXT) STRICT; INSERT INTO preserved VALUES ('intacto')")
    let executed = false
    const runner = new MigrationRunner(db, new TestLogger(), [{ version: 1, name: 'base', up: () => { executed = true } }])
    expect(() => runner.inspect()).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_TOO_NEW', details: { databaseSchema: 2, supportedSchema: 1 } }))
    expect(executed).toBe(false)
    expect(db.prepare('SELECT value FROM preserved').pluck().get()).toBe('intacto')
    expect(db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(2)
    db.close()
    expect(() => assertDatabaseSchemaSupported(databasePath, 1)).toThrowError(expect.objectContaining({ code: 'DATABASE_SCHEMA_TOO_NEW' }))
    const unchanged = new Database(databasePath, { readonly: true }); databases.push(unchanged)
    expect(unchanged.prepare('SELECT value FROM preserved').pluck().get()).toBe('intacto')
  })

  it('não inicia migration quando o before_migration falha', async () => {
    const { db } = setup()
    let executed = false
    const runner = new MigrationRunner(db, new TestLogger(), [migration1(db), { version: 2, name: 'next', up: () => { executed = true } }])
    const failedBackup = { async runProtected<T>(): Promise<T> { throw new DomainError('BACKUP_CREATE_FAILED', 'falha') } }
    await expect(runMigrationsSafely(runner, failedBackup, new TestLogger())).rejects.toMatchObject({ code: 'MIGRATION_BACKUP_FAILED' })
    expect(executed).toBe(false)
    expect(db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(1)
  })

  it('cria before_migration antes de aplicar uma migration válida', async () => {
    const { db, paths, backups } = setup()
    const runner = new MigrationRunner(db, new TestLogger(), [migration1(db), { version: 2, name: 'next', up: () => db.exec('ALTER TABLE works ADD COLUMN note TEXT') }])
    await expect(runMigrationsSafely(runner, backups, new TestLogger())).resolves.toBe(2)
    expect(readdirSync(paths.backups).some((name) => name.includes('before_migration'))).toBe(true)
    expect(db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(2)
  })

  it('mantém estado anterior e o backup quando uma migration falha', async () => {
    const { db, paths, backups } = setup()
    db.prepare('INSERT INTO works (id) VALUES (?)').run('preserved')
    const runner = new MigrationRunner(db, new TestLogger(), [migration1(db), { version: 2, name: 'broken', up: () => { db.exec('CREATE TABLE should_rollback (id TEXT) STRICT'); throw new Error('falha intencional') } }])
    await expect(runMigrationsSafely(runner, backups, new TestLogger())).rejects.toMatchObject({ code: 'MIGRATION_FAILED' })
    expect(db.prepare('SELECT id FROM works').pluck().all()).toEqual(['preserved'])
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'should_rollback'").get()).toBeUndefined()
    expect(db.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(1)
    expect(readdirSync(paths.backups).some((name) => name.includes('before_migration'))).toBe(true)
  })
})
