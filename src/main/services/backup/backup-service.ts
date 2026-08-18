import { createHash } from 'node:crypto'
import {
  copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, utimesSync, writeFileSync
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import type { BackupManifest, BackupPreview, BackupRecord, BackupState, BackupType, DataPaths } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { appSettingsSchema } from '@shared/schemas/settings'
import type { Logger } from '../../logging/logger'
import type { SettingsService } from '../settings-service'
import { assertRegularFile, createZip, extractZip } from './zip-archive'
import { createMigrations } from '../../database/migrations'
import { MigrationRunner } from '../../database/migrations/migration-runner'
import { CriticalOperationCoordinator, type CriticalOperation } from '../critical-operation-coordinator'

export const BACKUP_FORMAT_VERSION = 1 as const
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_CHECKSUMS_BYTES = 5 * 1024 * 1024

export interface BackupServiceOptions {
  closeDatabase?: () => void
  restartApplication?: () => void
  now?: () => Date
  criticalOperations?: CriticalOperationCoordinator
  recoveryMode?: boolean
}

export class BackupService {
  private readonly now: () => Date
  private readonly criticalOperations: CriticalOperationCoordinator

  constructor(
    private readonly db: Database.Database,
    private readonly paths: DataPaths,
    private readonly settings: SettingsService,
    private readonly logger: Logger,
    private readonly appVersion: string,
    private readonly schemaVersion: number,
    private readonly options: BackupServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
    this.criticalOperations = options.criticalOperations ?? new CriticalOperationCoordinator()
  }

  getState(): BackupState {
    const configured = this.settings.getSettings().backupDirectory
    const directory = configured ?? this.paths.backups
    const available = !configured || (existsSync(configured) && statSync(configured).isDirectory())
    const current = this.settings.getSettings()
    return {
      directory,
      directoryAvailable: available,
      automatic: current.backupAutomatic,
      frequency: current.backupFrequency,
      retention: current.backupRetention,
      backups: this.listBackups(this.effectiveDirectory())
    }
  }

  async createBackup(type: BackupType = 'manual'): Promise<BackupRecord> {
    return this.exclusive('backup', () => this.createBackupInternal(type))
  }

  async runProtected<T>(backupType: BackupType, operation: () => Promise<T> | T, criticalOperation: CriticalOperation = backupType === 'before_migration' ? 'migration' : 'import'): Promise<T> {
    return this.exclusive(criticalOperation, async () => {
      await this.createBackupInternal(backupType)
      return operation()
    })
  }

  async runAutomaticIfDue(): Promise<BackupRecord | null> {
    const settings = this.settings.getSettings()
    if (!settings.backupAutomatic || this.criticalOperations.isBusy) return null
    const latest = this.listBackups(this.effectiveDirectory()).find((item) => item.type === 'auto')
    const interval = settings.backupFrequency === 'weekly' ? 7 * 86_400_000 : 86_400_000
    if (latest && this.now().getTime() - Date.parse(latest.createdAt) < interval) return null
    return this.exclusive('backup', async () => {
      const created = await this.createBackupInternal('auto')
      this.applyAutomaticRetention(settings.backupRetention)
      return created
    })
  }

  async previewBackup(path: string): Promise<BackupPreview> {
    try {
      return await this.withExtracted(path, (root, entries) => {
        const manifest = this.validateExtracted(root)
        return this.toPreview(path, manifest, entries)
      })
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('BACKUP_INVALID', 'O arquivo selecionado não é um backup válido do Lumi.')
    }
  }

  async restoreBackup(path: string): Promise<void> {
    await this.exclusive('restore', async () => {
      const startedAt = Date.now()
      this.logger.info('backup', 'Iniciando restauração de backup.', { event: 'backup.restore_started' })
      const extracted = mkdtempSync(join(tmpdir(), 'lumi-restore-'))
      try {
        const entries = await extractZip(path, extracted)
        const manifest = this.validateExtracted(extracted)
        if (manifest.schemaVersion < this.schemaVersion) this.migrateStagedDatabase(join(extracted, 'library.db'))
        if (this.options.recoveryMode) this.preserveFailedDatabase()
        else await this.createBackupInternal('before_restore')
        this.installRestore(extracted, entries)
        this.logger.info('backup', 'Backup restaurado.', { event: 'backup.restored', schemaVersion: manifest.schemaVersion, durationMs: Date.now() - startedAt })
      } catch (error) {
        if (error instanceof DomainError) throw error
        throw new DomainError('BACKUP_RESTORE_FAILED', 'Não foi possível restaurar este backup com segurança.')
      } finally {
        rmSync(extracted, { recursive: true, force: true })
      }
    })
  }

  deleteBackup(path: string): void {
    const root = resolve(this.effectiveDirectory())
    const target = resolve(path)
    if (!target.startsWith(`${root}${sep}`) || extname(target) !== '.lumi-backup') {
      throw new DomainError('INVALID_INPUT', 'Arquivo de backup inválido.')
    }
    rmSync(target, { force: true })
  }

  private async createBackupInternal(type: BackupType): Promise<BackupRecord> {
    const startedAt = Date.now()
    this.logger.info('backup', 'Iniciando backup.', { event: 'backup.started', type })
    const destinationDirectory = this.effectiveDirectory()
    mkdirSync(destinationDirectory, { recursive: true })
    const stage = mkdtempSync(join(tmpdir(), 'lumi-backup-'))
    const createdAt = this.now().toISOString()
    const stamp = createdAt.replace(/[:.]/g, '-')
    const fileName = `lumi-${type}-${stamp}.lumi-backup`
    const finalPath = join(destinationDirectory, fileName)
    const temporaryPath = join(destinationDirectory, `.${fileName}.tmp`)
    try {
      await this.db.backup(join(stage, 'library.db'))
      const currentSchemaVersion = this.getCurrentSchemaVersion(this.db)
      const manifest: BackupManifest = {
        format: 'lumi-backup', formatVersion: BACKUP_FORMAT_VERSION, appVersion: this.appVersion,
        schemaVersion: currentSchemaVersion, createdAt, type,
        workCount: this.tableExists(this.db, 'works') ? (this.db.prepare('SELECT COUNT(*) AS count FROM works').get() as { count: number }).count : 0
      }
      writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
      if (existsSync(this.paths.settings)) copyFileSync(this.paths.settings, join(stage, 'settings.json'))
      if (existsSync(this.paths.assets)) cpSync(this.paths.assets, join(stage, 'assets'), { recursive: true })
      const payload = this.listFiles(stage)
      const checksums = Object.fromEntries(payload.map((entry) => [entry, this.sha256(join(stage, ...entry.split('/')))]))
      writeFileSync(join(stage, 'checksums.json'), JSON.stringify(checksums, null, 2), 'utf8')
      await createZip(stage, [...payload, 'checksums.json'], temporaryPath)
      await this.withExtracted(temporaryPath, (root) => { this.validateExtracted(root) })
      renameSync(temporaryPath, finalPath)
      const backupDate = new Date(createdAt)
      utimesSync(finalPath, backupDate, backupDate)
      const record = this.toRecord(finalPath, manifest)
      this.logger.info('backup', 'Backup criado.', { event: 'backup.created', type, workCount: manifest.workCount, size: record.size, durationMs: Date.now() - startedAt })
      return record
    } catch (error) {
      rmSync(temporaryPath, { force: true })
      this.logger.error('backup', 'Falha ao criar backup.', { event: 'backup.create_failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
      if (error instanceof DomainError) throw error
      throw new DomainError('BACKUP_CREATE_FAILED', 'Não foi possível criar o backup.')
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }

  private validateExtracted(root: string): BackupManifest {
    const manifestPath = join(root, 'manifest.json')
    const checksumsPath = join(root, 'checksums.json')
    const databasePath = join(root, 'library.db')
    assertRegularFile(manifestPath)
    assertRegularFile(checksumsPath)
    assertRegularFile(databasePath)
    if (statSync(manifestPath).size > MAX_MANIFEST_BYTES) throw new DomainError('BACKUP_INVALID', 'Manifesto de backup inválido.')
    if (statSync(checksumsPath).size > MAX_CHECKSUMS_BYTES) throw new DomainError('BACKUP_INVALID', 'Lista de checksums inválida.')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<BackupManifest>
    if (manifest.format !== 'lumi-backup' || manifest.formatVersion !== 1 || typeof manifest.appVersion !== 'string' || !manifest.createdAt || !manifest.type || !['manual', 'auto', 'before_restore', 'before_import', 'before_migration'].includes(manifest.type) || !Number.isInteger(manifest.schemaVersion) || !Number.isInteger(manifest.workCount)) {
      throw new DomainError('BACKUP_INVALID', 'Manifesto de backup inválido.')
    }
    if ((manifest.schemaVersion as number) > this.schemaVersion) {
      throw new DomainError('BACKUP_TOO_NEW', 'Este backup foi criado por uma versão mais nova do Lumi.')
    }
    const checksums = JSON.parse(readFileSync(checksumsPath, 'utf8')) as Record<string, unknown>
    const payloadEntries = this.listFiles(root).filter((entry) => entry !== 'checksums.json')
    if (payloadEntries.some((entry) => entry !== 'manifest.json' && entry !== 'library.db' && entry !== 'settings.json' && !entry.startsWith('assets/')) || payloadEntries.length !== Object.keys(checksums).length || payloadEntries.some((entry) => !(entry in checksums))) {
      throw new DomainError('BACKUP_INVALID', 'A estrutura do backup não corresponde à lista de checksums.')
    }
    for (const [entry, expected] of Object.entries(checksums)) {
      const file = resolve(root, ...entry.split('/'))
      if (typeof expected !== 'string' || !file.startsWith(`${resolve(root)}${sep}`) || !existsSync(file) || this.sha256(file) !== expected) {
        throw new DomainError('BACKUP_INVALID', 'A verificação de integridade do backup falhou.')
      }
    }
    const checkDb = new Database(databasePath, { readonly: true, fileMustExist: true })
    try {
      if (checkDb.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('quick_check')
      const foreignKeys = checkDb.pragma('foreign_key_check') as unknown[]
      if (foreignKeys.length) throw new Error('foreign_key_check')
      const version = this.getCurrentSchemaVersion(checkDb)
      if (version !== manifest.schemaVersion) throw new Error('schema mismatch')
    } catch {
      throw new DomainError('BACKUP_INVALID', 'O banco de dados do backup não passou na verificação de integridade.')
    } finally {
      checkDb.close()
    }
    return manifest as BackupManifest
  }

  private installRestore(root: string, entries: readonly string[]): void {
    const databaseNext = `${this.paths.database}.restore-next`
    const databaseRollback = `${this.paths.database}.restore-rollback`
    const settingsNext = `${this.paths.settings}.restore-next`
    const settingsRollback = `${this.paths.settings}.restore-rollback`
    const assetsNext = `${this.paths.assets}.restore-next`
    const assetsRollback = `${this.paths.assets}.restore-rollback`
    const cleanup = [databaseNext, databaseRollback, settingsNext, settingsRollback, assetsNext, assetsRollback]
    for (const target of cleanup) rmSync(target, { recursive: true, force: true })
    copyFileSync(join(root, 'library.db'), databaseNext)
    if (entries.includes('settings.json')) {
      const restoredSettings = appSettingsSchema.parse(JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8')))
      restoredSettings.backupDirectory = this.settings.getSettings().backupDirectory
      writeFileSync(settingsNext, `${JSON.stringify(restoredSettings, null, 2)}\n`, 'utf8')
    }
    mkdirSync(assetsNext, { recursive: true })
    if (existsSync(join(root, 'assets'))) cpSync(join(root, 'assets'), assetsNext, { recursive: true })
    this.options.closeDatabase?.()
    rmSync(`${this.paths.database}-wal`, { force: true })
    rmSync(`${this.paths.database}-shm`, { force: true })
    try {
      if (existsSync(this.paths.database)) renameSync(this.paths.database, databaseRollback)
      renameSync(databaseNext, this.paths.database)
      if (existsSync(this.paths.settings)) renameSync(this.paths.settings, settingsRollback)
      if (existsSync(settingsNext)) renameSync(settingsNext, this.paths.settings)
      if (existsSync(this.paths.assets)) renameSync(this.paths.assets, assetsRollback)
      renameSync(assetsNext, this.paths.assets)
      const restored = new Database(this.paths.database, { readonly: true, fileMustExist: true })
      try {
        if (restored.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('quick_check')
        if ((restored.pragma('foreign_key_check') as unknown[]).length) throw new Error('foreign_key_check')
        const version = (restored.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version
        if (version !== this.schemaVersion) throw new Error('schema mismatch')
      } finally { restored.close() }
      rmSync(databaseRollback, { force: true })
      rmSync(settingsRollback, { force: true })
      rmSync(assetsRollback, { recursive: true, force: true })
      rmSync(this.paths.coverCache, { recursive: true, force: true })
      mkdirSync(this.paths.coverCache, { recursive: true })
      setTimeout(() => this.options.restartApplication?.(), 250)
    } catch (error) {
      rmSync(this.paths.database, { force: true })
      if (existsSync(databaseRollback)) renameSync(databaseRollback, this.paths.database)
      rmSync(this.paths.settings, { force: true })
      if (existsSync(settingsRollback)) renameSync(settingsRollback, this.paths.settings)
      rmSync(this.paths.assets, { recursive: true, force: true })
      if (existsSync(assetsRollback)) renameSync(assetsRollback, this.paths.assets)
      setTimeout(() => this.options.restartApplication?.(), 250)
      throw error
    } finally {
      for (const target of cleanup) rmSync(target, { recursive: true, force: true })
    }
  }

  private preserveFailedDatabase(): void {
    if (!existsSync(this.paths.database)) return
    const directory = this.effectiveDirectory()
    mkdirSync(directory, { recursive: true })
    const stamp = this.now().toISOString().replace(/[:.]/g, '-')
    copyFileSync(this.paths.database, join(directory, `lumi-failed-database-${stamp}.sqlite`))
  }

  private effectiveDirectory(): string {
    const configured = this.settings.getSettings().backupDirectory
    if (configured && existsSync(configured) && statSync(configured).isDirectory()) return configured
    if (configured) this.logger.warn('backup', 'Diretório personalizado indisponível; usando o diretório padrão.', { event: 'backup.directory_fallback' })
    return this.paths.backups
  }

  private migrateStagedDatabase(databasePath: string): void {
    const staged = new Database(databasePath)
    try {
      staged.pragma('foreign_keys = ON')
      new MigrationRunner(staged, this.logger, createMigrations(staged)).run()
      if (staged.pragma('quick_check', { simple: true }) !== 'ok' || (staged.pragma('foreign_key_check') as unknown[]).length) {
        throw new DomainError('BACKUP_INVALID', 'O banco migrado não passou na verificação de integridade.')
      }
    } finally { staged.close() }
  }

  private getCurrentSchemaVersion(database: Database.Database): number {
    if (!this.tableExists(database, 'schema_migrations')) return 0
    return (database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version
  }

  private tableExists(database: Database.Database, table: string): boolean {
    return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
  }

  private listBackups(directory: string): BackupRecord[] {
    if (!existsSync(directory)) return []
    const records: BackupRecord[] = []
    for (const fileName of readdirSync(directory).filter((name) => name.endsWith('.lumi-backup'))) {
      const match = /^lumi-(manual|auto|before_restore|before_import|before_migration)-(.+)\.lumi-backup$/.exec(fileName)
      if (!match) continue
      const path = join(directory, fileName)
      const stats = statSync(path)
      records.push({ path, fileName, size: stats.size, createdAt: stats.mtime.toISOString(), type: match[1] as BackupType, workCount: -1 })
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private applyAutomaticRetention(retention: number): void {
    for (const old of this.listBackups(this.effectiveDirectory()).filter((item) => item.type === 'auto').slice(retention)) rmSync(old.path, { force: true })
  }

  private async withExtracted<T>(path: string, operation: (root: string, entries: string[]) => T): Promise<T> {
    const root = mkdtempSync(join(tmpdir(), 'lumi-validate-'))
    try { return operation(root, await extractZip(path, root)) } finally { rmSync(root, { recursive: true, force: true }) }
  }

  private toRecord(path: string, manifest: BackupManifest): BackupRecord {
    return { path, fileName: basename(path), size: statSync(path).size, createdAt: manifest.createdAt, type: manifest.type, workCount: manifest.workCount }
  }

  private toPreview(path: string, manifest: BackupManifest, entries: readonly string[]): BackupPreview {
    return { ...this.toRecord(path, manifest), appVersion: manifest.appVersion, schemaVersion: manifest.schemaVersion, includesSettings: entries.includes('settings.json'), assetCount: entries.filter((entry) => entry.startsWith('assets/') && !entry.endsWith('/')).length }
  }

  private listFiles(root: string, current = root): string[] {
    const output: string[] = []
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) output.push(...this.listFiles(root, absolute))
      else if (entry.isFile()) output.push(relative(root, absolute).split(sep).join('/'))
    }
    return output.sort()
  }

  private sha256(path: string): string { return createHash('sha256').update(readFileSync(path)).digest('hex') }

  private async exclusive<T>(kind: CriticalOperation, operation: () => Promise<T>): Promise<T> {
    return this.criticalOperations.run(kind, operation)
  }
}
