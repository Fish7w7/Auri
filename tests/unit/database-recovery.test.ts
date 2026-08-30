import { describe, expect, it } from 'vitest'
import { classifyDatabaseOpenFailure } from '@main/services/database-recovery-service'
import { DomainError } from '@shared/errors/domain-error'

describe('classifyDatabaseOpenFailure', () => {
  it('preserva a classificação de schema mais novo', () => {
    expect(classifyDatabaseOpenFailure(new DomainError('DATABASE_SCHEMA_TOO_NEW', 'schema 4', { databaseSchema: 4, supportedSchema: 3 }))).toMatchObject({
      kind: 'schema_too_new', databaseSchema: 4, supportedSchema: 3
    })
  })

  it.each([
    [Object.assign(new Error('permission denied'), { code: 'EACCES' }), 'permission'],
    [Object.assign(new Error('missing'), { code: 'ENOENT' }), 'missing'],
    [new Error('database disk image is malformed'), 'corruption'],
    [new Error('SQLITE_BUSY: database is locked'), 'temporary'],
    [new Error('SQLITE_ERROR: unknown failure'), 'sqlite']
  ] as const)('diferencia falhas sem executar qualquer recuperação (%s)', (error, expected) => {
    expect(classifyDatabaseOpenFailure(error).kind).toBe(expected)
  })
})
