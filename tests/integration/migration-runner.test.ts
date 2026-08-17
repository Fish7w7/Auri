import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { TestLogger } from '../helpers/test-logger'

describe('MigrationRunner', () => {
  let db: Database.Database | undefined

  afterEach(() => db?.close())

  it('aplica migrations incrementais e não reaplica as já executadas', () => {
    db = new Database(':memory:')
    const logger = new TestLogger()
    let executions = 0
    const migrations = [
      {
        version: 1,
        name: 'test_table',
        up: () => {
          executions += 1
          db!.exec('CREATE TABLE test_items (id INTEGER PRIMARY KEY) STRICT')
        }
      }
    ]

    expect(new MigrationRunner(db, logger, migrations).run()).toBe(1)
    expect(new MigrationRunner(db, logger, migrations).run()).toBe(1)
    expect(executions).toBe(1)
  })

  it('reverte toda a migration quando uma etapa falha', () => {
    db = new Database(':memory:')
    const logger = new TestLogger()
    const runner = new MigrationRunner(db, logger, [
      {
        version: 1,
        name: 'broken',
        up: () => {
          db!.exec('CREATE TABLE should_rollback (id INTEGER PRIMARY KEY) STRICT')
          throw new Error('falha intencional')
        }
      }
    ])

    expect(() => runner.run()).toThrow('falha intencional')
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'")
      .get()
    expect(table).toBeUndefined()
  })

  it('rejeita lacunas na sequência de versões', () => {
    db = new Database(':memory:')
    const runner = new MigrationRunner(db, new TestLogger(), [
      { version: 2, name: 'gap', up: () => undefined }
    ])

    expect(() => runner.run()).toThrow('esperada 1, recebida 2')
  })
})

