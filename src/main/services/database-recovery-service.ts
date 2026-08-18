import Database from 'better-sqlite3'
import type { App } from 'electron'
import { DomainError } from '@shared/errors/domain-error'
import { resolveDataPaths } from '../app/data-paths'
import { createMigrations, SUPPORTED_SCHEMA_VERSION } from '../database/migrations'
import { MigrationRunner } from '../database/migrations/migration-runner'
import type { Logger } from '../logging/logger'
import { BackupService } from './backup/backup-service'
import { CriticalOperationCoordinator } from './critical-operation-coordinator'
import { SettingsService } from './settings-service'

export type DatabaseOpenFailureKind = 'corruption' | 'schema_too_new' | 'missing' | 'permission' | 'temporary' | 'sqlite' | 'unknown'

export interface DatabaseOpenFailure {
  kind: DatabaseOpenFailureKind
  title: string
  explanation: string
  technicalDetails: string
}

export function classifyDatabaseOpenFailure(error: unknown): DatabaseOpenFailure {
  const code = error instanceof DomainError ? error.code : String((error as NodeJS.ErrnoException | undefined)?.code ?? '')
  const message = error instanceof Error ? error.message : 'Erro desconhecido.'
  const normalized = `${code} ${message}`.toLowerCase()
  const base = { technicalDetails: `${error instanceof Error ? error.name : 'Error'}${code ? ` (${code})` : ''}: ${message}` }
  if (code === 'DATABASE_SCHEMA_TOO_NEW') return { kind: 'schema_too_new', title: 'Esta biblioteca usa um schema mais novo.', explanation: 'Instale uma versão mais recente do Lumi ou restaure um backup compatível.', ...base }
  if (code === 'ENOENT') return { kind: 'missing', title: 'O arquivo da biblioteca não foi encontrado.', explanation: 'Tente novamente ou restaure um backup existente.', ...base }
  if (code === 'EACCES' || code === 'EPERM' || normalized.includes('readonly')) return { kind: 'permission', title: 'O Lumi não tem permissão para abrir a biblioteca.', explanation: 'Verifique as permissões da pasta de dados e tente novamente.', ...base }
  if (normalized.includes('malformed') || normalized.includes('corrupt') || normalized.includes('not a database')) return { kind: 'corruption', title: 'A biblioteca apresentou sinais de corrupção.', explanation: 'Os dados não foram alterados. Você pode restaurar um backup com seu consentimento.', ...base }
  if (normalized.includes('busy') || normalized.includes('locked') || normalized.includes('cantopen')) return { kind: 'temporary', title: 'A biblioteca está temporariamente indisponível.', explanation: 'Outro processo ou uma condição temporária pode estar impedindo a abertura.', ...base }
  if (normalized.includes('sqlite')) return { kind: 'sqlite', title: 'O SQLite não conseguiu abrir a biblioteca.', explanation: 'Os dados não foram alterados. Consulte os detalhes técnicos antes de decidir como continuar.', ...base }
  return { kind: 'unknown', title: 'Não foi possível abrir sua biblioteca.', explanation: 'O Lumi não alterou seus dados.', ...base }
}

export function createRecoveryBackupService(app: App, logger: Logger): { backups: BackupService; dispose(): void } {
  const paths = resolveDataPaths(app.getPath('userData'))
  const database = new Database(':memory:')
  new MigrationRunner(database, logger, createMigrations(database)).run()
  const settings = new SettingsService(paths.settings, logger)
  const backups = new BackupService(database, paths, settings, logger, app.getVersion(), SUPPORTED_SCHEMA_VERSION, {
    recoveryMode: true,
    criticalOperations: new CriticalOperationCoordinator(),
    closeDatabase: () => { if (database.open) database.close() },
    restartApplication: () => { app.relaunch(); app.exit(0) }
  })
  return { backups, dispose: () => { if (database.open) database.close() } }
}
