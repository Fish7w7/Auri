import type Database from 'better-sqlite3'
import type { Migration } from '@shared/types/database'
import type { Logger } from '../../logging/logger'
import { MigrationRepository } from '../repositories/migration-repository'
import { DomainError } from '@shared/errors/domain-error'

export interface MigrationInspection {
  currentVersion: number
  targetVersion: number
  pending: readonly Migration[]
}

export class MigrationRunner {
  private readonly repository: MigrationRepository

  constructor(
    private readonly db: Database.Database,
    private readonly logger: Logger,
    private readonly migrations: readonly Migration[]
  ) {
    this.repository = new MigrationRepository(db)
  }

  run(): number {
    const inspection = this.inspect()
    if (!inspection.pending.length) return inspection.currentVersion

    const migrate = this.db.transaction(() => {
      this.repository.ensureTable()
      for (const migration of inspection.pending) {
        this.logger.info('migration', 'Aplicando migration.', {
          event: 'migration.started', version: migration.version, name: migration.name
        })
        migration.up()
        this.repository.markApplied(migration.version, migration.name, new Date().toISOString())
      }
      this.assertHealthy()
    })
    migrate.immediate()
    for (const migration of inspection.pending) {
      this.logger.info('migration', 'Migration aplicada.', { event: 'migration.completed', version: migration.version, name: migration.name })
    }
    return this.repository.getCurrentVersion()
  }

  inspect(): MigrationInspection {
    this.validateDefinitions()
    const appliedRows = this.repository.tableExists() ? this.repository.listApplied() : []
    const applied = new Map(appliedRows.map((migration) => [migration.version, migration.name]))
    const targetVersion = this.migrations.at(-1)?.version ?? 0
    const currentVersion = appliedRows.at(-1)?.version ?? 0

    if (currentVersion > targetVersion) {
      throw new DomainError('DATABASE_SCHEMA_TOO_NEW', `Esta biblioteca foi atualizada por uma versão mais recente do Lumi. Banco: schema ${currentVersion}. Esta versão suporta até: schema ${targetVersion}.`, { databaseSchema: currentVersion, supportedSchema: targetVersion })
    }
    for (const [version, name] of applied) {
      const known = this.migrations.find((migration) => migration.version === version)
      if (!known) {
        throw new DomainError('DATABASE_SCHEMA_TOO_NEW', `Esta biblioteca usa o schema ${version}, que não é suportado por esta versão do Lumi.`, { databaseSchema: version, supportedSchema: targetVersion })
      }
      if (known.name !== name) throw new DomainError('MIGRATION_FAILED', `A migration ${version} registrada não corresponde à definição desta versão do Lumi.`)
    }
    return { currentVersion, targetVersion, pending: this.migrations.filter((migration) => !applied.has(migration.version)) }
  }

  private validateDefinitions(): void {
    const versions = new Set<number>()
    let expectedVersion = 1

    for (const migration of this.migrations) {
      if (!Number.isInteger(migration.version) || migration.version <= 0) {
        throw new Error('Toda migration deve possuir uma versão inteira positiva.')
      }
      if (versions.has(migration.version)) {
        throw new Error(`Versão de migration duplicada: ${migration.version}.`)
      }
      if (migration.version !== expectedVersion) {
        throw new Error(
          `Sequência de migrations inválida: esperada ${expectedVersion}, recebida ${migration.version}.`
        )
      }

      versions.add(migration.version)
      expectedVersion += 1
    }
  }

  private assertHealthy(): void {
    if (this.db.pragma('quick_check', { simple: true }) !== 'ok') throw new DomainError('MIGRATION_FAILED', 'O banco não passou na verificação de integridade após a migration.')
    if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new DomainError('MIGRATION_FAILED', 'O banco possui referências inválidas após a migration.')
  }
}
