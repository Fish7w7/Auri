import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyDatabaseOpenFailure } from '@main/services/database-recovery-service'
import { DomainError } from '@shared/errors/domain-error'

describe('classifyDatabaseOpenFailure', () => {
  it('mantém manifests sincronizados na versão 1.3.1', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
    const lock = JSON.parse(readFileSync(join(process.cwd(), 'package-lock.json'), 'utf8')) as { version: string; packages: Record<string, { version?: string }> }
    expect(manifest.version).toBe('1.3.1')
    expect(lock.version).toBe(manifest.version)
    expect(lock.packages[''].version).toBe(manifest.version)
  })

  it('preserva a classificação de schema mais novo', () => {
    expect(classifyDatabaseOpenFailure(new DomainError('DATABASE_SCHEMA_TOO_NEW', 'schema 2')).kind).toBe('schema_too_new')
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
