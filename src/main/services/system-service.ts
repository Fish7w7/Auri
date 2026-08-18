import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DataPaths, LibraryIntegrityResult, StorageUsage, SystemDiagnostics, SystemStatus } from '@shared/contracts'
import { systemStatusSchema } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { BACKUP_FORMAT_VERSION, type BackupService } from './backup/backup-service'
import type { CoverService } from './covers/cover-service'
import type { CriticalOperationCoordinator } from './critical-operation-coordinator'
import type { Logger } from '../logging/logger'
import type { DatabaseIntegrityDetails } from '../database/repositories/system-repository'

export interface SystemRepositoryReader {
  getSchemaVersion(): number
  getSqliteVersion(): string
  checkIntegrity(): DatabaseIntegrityDetails
}

export class SystemService {
  private integrity: LibraryIntegrityResult | null = null

  constructor(
    private readonly repository: SystemRepositoryReader,
    private readonly appVersion: string,
    private readonly paths: DataPaths,
    private readonly backups: Pick<BackupService, 'getState'>,
    private readonly covers: Pick<CoverService, 'clearAllCache'>,
    private readonly logger: Logger,
    private readonly criticalOperations: CriticalOperationCoordinator
  ) {}

  getStatus(): SystemStatus {
    const platformName = platformLabel(process.platform)
    return systemStatusSchema.parse({
      appVersion: this.appVersion,
      backupFormatVersion: BACKUP_FORMAT_VERSION,
      platform: { name: platformName, architecture: process.arch, label: `${platformName} ${process.arch}` },
      runtime: {
        electron: process.versions.electron ?? 'indisponível',
        node: process.versions.node,
        chrome: process.versions.chrome ?? 'indisponível'
      },
      database: {
        state: 'ready',
        schemaVersion: this.repository.getSchemaVersion(),
        sqliteVersion: this.repository.getSqliteVersion()
      },
      paths: this.paths
    })
  }

  getDiagnostics(): SystemDiagnostics {
    return { status: this.getStatus(), storage: this.getStorageUsage(), integrity: this.integrity }
  }

  async checkIntegrity(): Promise<LibraryIntegrityResult> {
    return this.criticalOperations.run('diagnostic', () => {
      const details = this.repository.checkIntegrity()
      const healthy = details.quickCheck.length === 1 && details.quickCheck[0] === 'ok' && details.foreignKeyIssues.length === 0
      this.integrity = {
        healthy,
        checkedAt: new Date().toISOString(),
        summary: healthy ? 'Nenhum problema encontrado.' : 'A biblioteca apresentou inconsistências.',
        ...details
      }
      this.logger[healthy ? 'info' : 'warn']('database', healthy ? 'Verificação de integridade concluída.' : 'Verificação de integridade encontrou inconsistências.', {
        event: 'database.integrity_checked',
        quickCheckIssues: details.quickCheck.filter((item) => item !== 'ok').length,
        foreignKeyIssues: details.foreignKeyIssues.length
      })
      return this.integrity
    })
  }

  async clearCoverCache(): Promise<StorageUsage> {
    await this.criticalOperations.run('maintenance', () => this.covers.clearAllCache())
    this.logger.info('covers', 'Cache de capas limpo pelo usuário.', { event: 'covers.cache_cleared' })
    return this.getStorageUsage()
  }

  getStorageUsage(): StorageUsage {
    return {
      databaseBytes: fileSize(this.paths.database) + fileSize(`${this.paths.database}-wal`) + fileSize(`${this.paths.database}-shm`),
      customCoversBytes: directorySize(join(this.paths.assets, 'covers', 'custom')),
      coverCacheBytes: directorySize(this.paths.coverCache),
      backupsBytes: directorySize(this.effectiveBackupDirectory())
    }
  }

  getSystemInformationText(): string {
    const status = this.getStatus()
    return [
      `Lumi ${status.appVersion}`,
      `Database schema: ${status.database.schemaVersion}`,
      `Backup format: ${status.backupFormatVersion}`,
      status.platform.label,
      `Electron: ${status.runtime.electron}`,
      `Node: ${status.runtime.node}`,
      `Chrome: ${status.runtime.chrome}`,
      `SQLite: ${status.database.sqliteVersion}`
    ].join('\n')
  }

  exportDiagnostic(destination: string): string {
    try {
      const status = this.getStatus()
      const report = {
        format: 'lumi-diagnostic',
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        application: {
          version: status.appVersion,
          databaseSchema: status.database.schemaVersion,
          backupFormat: status.backupFormatVersion,
          platform: status.platform,
          runtime: { ...status.runtime, sqlite: status.database.sqliteVersion }
        },
        integrity: this.integrity,
        recentLogs: this.readSafeRecentLogs()
      }
      writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
      this.logger.info('app', 'Diagnóstico exportado.', { event: 'diagnostic.exported' })
      return destination
    } catch (error) {
      this.logger.error('app', 'Falha ao exportar diagnóstico.', { event: 'diagnostic.export_failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
      throw new DomainError('DIAGNOSTIC_EXPORT_FAILED', 'Não foi possível exportar o diagnóstico.')
    }
  }

  private effectiveBackupDirectory(): string {
    const state = this.backups.getState()
    return state.directoryAvailable ? state.directory : this.paths.backups
  }

  private readSafeRecentLogs(): Array<Record<string, string>> {
    const logPath = join(this.paths.logs, 'lumi.jsonl')
    if (!existsSync(logPath)) return []
    try {
      return readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-100).flatMap((line) => {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>
          const safe: Record<string, string> = {}
          for (const key of ['timestamp', 'level', 'category', 'event', 'errorCode']) if (typeof entry[key] === 'string') safe[key] = String(entry[key])
          return Object.keys(safe).length ? [safe] : []
        } catch { return [] }
      })
    } catch { return [] }
  }
}

function platformLabel(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

function fileSize(path: string): number {
  try { return existsSync(path) && statSync(path).isFile() ? statSync(path).size : 0 } catch { return 0 }
}

function directorySize(path: string): number {
  if (!existsSync(path)) return 0
  try {
    let total = 0
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const child = join(path, entry.name)
      if (entry.isDirectory()) total += directorySize(child)
      else if (entry.isFile()) total += fileSize(child)
    }
    return total
  } catch { return 0 }
}
