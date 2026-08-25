import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { createMigrations } from '@main/database/migrations'
import { SystemRepository } from '@main/database/repositories/system-repository'
import { SystemService, type SystemRepositoryReader } from '@main/services/system-service'
import { CriticalOperationCoordinator } from '@main/services/critical-operation-coordinator'
import type { DataPaths } from '@shared/contracts'
import { TestLogger } from '../helpers/test-logger'

const databases: Database.Database[] = []
const roots: string[] = []
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function setup(repository?: SystemRepositoryReader) {
  const root = mkdtempSync(join(tmpdir(), 'auri-system-')); roots.push(root)
  const paths: DataPaths = {
    root, database: join(root, 'data', 'library.sqlite'), assets: join(root, 'assets'),
    coverCache: join(root, 'cache', 'covers'), backups: join(root, 'backups'),
    logs: join(root, 'logs'), settings: join(root, 'settings.json')
  }
  for (const directory of [join(root, 'data'), paths.assets, paths.coverCache, paths.backups, paths.logs]) mkdirSync(directory, { recursive: true })
  let db: Database.Database | undefined
  if (!repository) {
    db = new Database(paths.database); databases.push(db)
    new MigrationRunner(db, new TestLogger(), createMigrations(db)).run()
    repository = new SystemRepository(db)
  }
  const logger = new TestLogger()
  const service = new SystemService(
    repository,
    '0.4.1',
    paths,
    { getState: () => ({ directory: paths.backups, directoryAvailable: true, automatic: true, frequency: 'daily', retention: 10, backups: [] }) },
    { clearAllCache: async () => ({ files: 0, bytes: 0, queue: 0, active: 0 }) },
    logger,
    new CriticalOperationCoordinator()
  )
  return { db, root, paths, logger, service }
}

describe('SystemService', () => {
  it('retorna ambiente real e integridade saudável', async () => {
    const { service } = setup()
    const status = service.getStatus()
    expect(status).toMatchObject({ appVersion: '0.4.1', backupFormatVersion: 1, database: { state: 'ready', schemaVersion: 2 } })
    expect(status.database.sqliteVersion).toMatch(/^3\./)
    await expect(service.checkIntegrity()).resolves.toMatchObject({ healthy: true, summary: 'Nenhum problema encontrado.', quickCheck: ['ok'], foreignKeyIssues: [] })
  })

  it('trata resultado inválido do quick_check como inconsistência', async () => {
    const { service } = setup({ getSchemaVersion: () => 1, getSqliteVersion: () => '3.0.0', checkIntegrity: () => ({ quickCheck: ['database disk image is malformed'], foreignKeyIssues: [] }) })
    await expect(service.checkIntegrity()).resolves.toMatchObject({ healthy: false, summary: 'A biblioteca apresentou inconsistências.' })
  })

  it('detecta inconsistência em foreign_key_check', async () => {
    const db = new Database(':memory:'); databases.push(db)
    db.pragma('foreign_keys = OFF')
    db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (1, 999);')
    const result = new SystemRepository(db).checkIntegrity()
    expect(result.quickCheck).toEqual(['ok'])
    expect(result.foreignKeyIssues).toEqual([{ table: 'child', parent: 'parent', foreignKeyId: 0 }])
  })

  it('exporta diagnóstico sem conteúdo privado dos logs ou caminhos pessoais', () => {
    const { service, paths } = setup()
    const privateTitle = 'Título secreto da obra'
    writeFileSync(join(paths.logs, 'auri.jsonl'), `${JSON.stringify({ timestamp: '2026-01-01T00:00:00.000Z', level: 'error', category: 'app', event: 'safe.event', errorCode: 'TEST', message: privateTitle, token: 'secret-token', path: paths.root, url: 'https://private.example/work' })}\n`, 'utf8')
    const destination = join(paths.root, 'diagnostic.json')
    expect(service.exportDiagnostic(destination)).toBe(destination)
    expect(existsSync(destination)).toBe(true)
    const report = readFileSync(destination, 'utf8')
    expect(report).toContain('"format": "auri-diagnostic"')
    expect(report).toContain('"name": "Auri"')
    expect(report).toContain('safe.event')
    expect(report).not.toContain(privateTitle)
    expect(report).not.toContain('secret-token')
    expect(report).not.toContain('private.example')
    expect(report).not.toContain(paths.root)
  })
})
