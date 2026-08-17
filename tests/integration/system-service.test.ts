import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { createMigrations } from '@main/database/migrations'
import { SystemRepository } from '@main/database/repositories/system-repository'
import { SystemService } from '@main/services/system-service'
import { TestLogger } from '../helpers/test-logger'

describe('SystemService', () => {
  let db: Database.Database | undefined

  afterEach(() => db?.close())

  it('retorna um diagnóstico tipado do banco local', () => {
    db = new Database(':memory:')
    new MigrationRunner(db, new TestLogger(), createMigrations(db)).run()

    const service = new SystemService(new SystemRepository(db), '0.1.0', {
      root: 'C:/Lumi',
      database: 'C:/Lumi/data/library.sqlite',
      assets: 'C:/Lumi/assets',
      coverCache: 'C:/Lumi/cache/covers',
      backups: 'C:/Lumi/backups',
      logs: 'C:/Lumi/logs',
      settings: 'C:/Lumi/settings.json'
    })

    const status = service.getStatus()
    expect(status.database.state).toBe('ready')
    expect(status.database.schemaVersion).toBe(1)
    expect(status.database.sqliteVersion).toMatch(/^3\./)
  })
})
