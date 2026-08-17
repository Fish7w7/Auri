import { DomainError } from '@shared/errors/domain-error'
import type { BackupType } from '@shared/contracts'
import type { Logger } from '../../logging/logger'
import type { MigrationRunner } from './migration-runner'

interface MigrationBackup {
  runProtected<T>(type: BackupType, operation: () => Promise<T> | T, criticalOperation?: 'migration'): Promise<T>
}

export async function runMigrationsSafely(
  runner: MigrationRunner,
  backups: MigrationBackup,
  logger: Logger
): Promise<number> {
  const inspection = runner.inspect()
  if (!inspection.pending.length) return runner.run()

  try {
    return await backups.runProtected('before_migration', () => {
      try { return runner.run() }
      catch (error) {
        logger.error('migration', 'Migration falhou; alterações revertidas.', { event: 'migration.failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
        if (error instanceof DomainError) throw error
        throw new DomainError('MIGRATION_FAILED', 'Não foi possível atualizar a estrutura da biblioteca. O banco anterior foi preservado.')
      }
    }, 'migration')
  } catch (error) {
    if (error instanceof DomainError && error.code === 'MIGRATION_FAILED') throw error
    logger.error('migration', 'Backup preventivo da migration falhou.', { event: 'migration.backup_failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
    throw new DomainError('MIGRATION_BACKUP_FAILED', 'Não foi possível criar o backup de segurança. A migration não foi iniciada.')
  }
}
