import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataPaths } from '@shared/contracts'
import { BackupService } from '@main/services/backup/backup-service'
import { createZip, extractZip } from '@main/services/backup/zip-archive'
import { SettingsService } from '@main/services/settings-service'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'
import { TestLogger } from '../helpers/test-logger'

const roots: string[] = []
const databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function setup(now: () => Date = () => new Date('2026-08-17T12:00:00.000Z')) {
  const root = mkdtempSync(join(tmpdir(), 'auri-backup-test-')); roots.push(root)
  const paths: DataPaths = { root, database: join(root, 'data', 'library.sqlite'), assets: join(root, 'assets'), coverCache: join(root, 'cache', 'covers'), backups: join(root, 'backups'), logs: join(root, 'logs'), settings: join(root, 'settings.json') }
  for (const directory of [join(root, 'data'), paths.assets, paths.coverCache, paths.backups, paths.logs]) mkdirSync(directory, { recursive: true })
  const fixture = createDomainFixture(paths.database)
  databases.push(fixture.db)
  const settings = new SettingsService(paths.settings, new TestLogger())
  const service = new BackupService(fixture.db, paths, settings, new TestLogger(), '0.1.0', 2, { now })
  return { root, paths, fixture, settings, service }
}

async function rewriteArchive(archive: string, mutate: (stage: string) => void): Promise<string> {
  const stage = mkdtempSync(join(tmpdir(), 'auri-rewrite-')); roots.push(stage)
  const entries = await extractZip(archive, stage)
  mutate(stage)
  const output = join(stage, 'rewritten.auri-backup')
  await createZip(stage, entries.filter((entry) => !entry.endsWith('/')), output)
  return output
}

function updateChecksum(stage: string, entry: string): void {
  const path = join(stage, 'checksums.json')
  const checksums = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  checksums[entry] = createHash('sha256').update(readFileSync(join(stage, entry))).digest('hex')
  writeFileSync(path, JSON.stringify(checksums), 'utf8')
}

describe('BackupService', () => {
  it('cria e valida um .auri-backup com manifesto Auri, banco, preferências, assets e checksums', async () => {
    const { paths, fixture, settings, service } = setup()
    createMinimalWork(fixture)
    settings.updateSettings({ backupRetention: 5 })
    writeFileSync(join(paths.assets, 'cover.webp'), 'permanent')
    writeFileSync(join(paths.coverCache, 'remote.webp'), 'cache')
    const backup = await service.createBackup()
    expect(backup.fileName).toMatch(/^auri-manual-.+\.auri-backup$/)
    const preview = await service.previewBackup(backup.path)
    expect(preview).toMatchObject({ schemaVersion: 2, workCount: 1, includesSettings: true, assetCount: 1 })
    const extracted = mkdtempSync(join(tmpdir(), 'auri-extract-')); roots.push(extracted)
    const entries = await extractZip(backup.path, extracted)
    expect(entries).toContain('checksums.json')
    expect(entries).toContain('assets/cover.webp')
    expect(entries.some((entry) => entry.includes('cache'))).toBe(false)
  })

  it('restaura um .lumi-backup legado com toda a biblioteca íntegra', async () => {
    const { paths, fixture, settings, service } = setup()
    const details = fixture.services.details.createDetailed({
      title: 'Backup legado', mediaType: 'manhwa', userStatus: 'reading', chapter: '42', favorite: true,
      notes: 'Nota preservada', lastReadNote: 'Parei aqui', cover: { type: 'custom', customPath: 'covers/custom/legacy.webp' },
      aliases: [{ name: 'Alias legado', kind: 'synonym', source: 'user' }],
      creators: [{ name: 'Autora legada', role: 'author' }], genres: ['Fantasia'], tags: ['Magia'],
      externalRefs: [{ provider: 'anilist', externalId: '123', canonicalUrl: 'https://anilist.co/manga/123' }]
    })
    fixture.services.details.createCollection({ name: 'Coleção legada', workId: details.work.id })
    fixture.services.sources.createSource({ workId: details.work.id, seriesUrl: 'https://reader.example/legacy', isPreferred: true })
    fixture.services.progress.updateProgress({ workId: details.work.id, chapterLabel: '43', confirmed: true })
    settings.updateSettings({ cardSize: 'large' })
    mkdirSync(join(paths.assets, 'covers', 'custom'), { recursive: true })
    writeFileSync(join(paths.assets, 'covers', 'custom', 'legacy.webp'), 'capa legada')

    const current = await service.createBackup()
    const rewritten = await rewriteArchive(current.path, (stage) => {
      const manifestPath = join(stage, 'manifest.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      manifest.format = 'lumi-backup'
      manifest.schemaVersion = 1
      const legacyDatabase = new Database(join(stage, 'library.db'))
      legacyDatabase.exec('DROP INDEX idx_works_home_visibility; ALTER TABLE works DROP COLUMN hidden_from_home; DELETE FROM schema_migrations WHERE version = 2')
      legacyDatabase.close()
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
      updateChecksum(stage, 'library.db')
      updateChecksum(stage, 'manifest.json')
    })
    const legacy = join(paths.backups, current.fileName.replace(/^auri-/, 'lumi-').replace(/\.auri-backup$/, '.lumi-backup'))
    writeFileSync(legacy, readFileSync(rewritten))
    expect(service.getState().backups.some((item) => item.path === legacy)).toBe(true)
    await expect(service.previewBackup(legacy)).resolves.toMatchObject({ workCount: 1, schemaVersion: 1 })

    let restarted = false
    const restore = new BackupService(fixture.db, paths, settings, new TestLogger(), '1.2.0', 2, { closeDatabase: () => fixture.db.close(), restartApplication: () => { restarted = true } })
    await restore.restoreBackup(legacy)
    const restored = new Database(paths.database, { readonly: true })
    try {
      for (const table of ['works', 'reading_history', 'aliases', 'work_creators', 'genres', 'work_genres', 'tags', 'work_tags', 'collections', 'collection_items', 'sources', 'external_refs']) {
        expect((restored.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count).toBeGreaterThan(0)
      }
      expect(restored.prepare('SELECT favorite, hidden_from_home, notes, last_read_note, cover_type, cover_custom_path FROM works').get()).toMatchObject({ favorite: 1, hidden_from_home: 0, notes: 'Nota preservada', last_read_note: 'Parei aqui', cover_type: 'custom', cover_custom_path: 'covers/custom/legacy.webp' })
      expect(restored.prepare('SELECT is_preferred FROM sources').get()).toMatchObject({ is_preferred: 1 })
    } finally { restored.close() }
    expect(readFileSync(join(paths.assets, 'covers', 'custom', 'legacy.webp'), 'utf8')).toBe('capa legada')
    expect(JSON.parse(readFileSync(paths.settings, 'utf8'))).toMatchObject({ cardSize: 'large' })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(restarted).toBe(true)
  })

  it('rejeita backup cujo conteúdo não corresponde ao checksum', async () => {
    const { fixture, service } = setup()
    createMinimalWork(fixture, 'Biblioteca preservada')
    const backup = await service.createBackup()
    const corrupted = await rewriteArchive(backup.path, (stage) => writeFileSync(join(stage, 'library.db'), 'corrompido'))
    await expect(service.restoreBackup(corrupted)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
    expect(fixture.services.library.queryWorks({}).map((work) => work.title)).toEqual(['Biblioteca preservada'])
  })

  it('rejeita banco com violação de foreign key mesmo com checksum atualizado', async () => {
    const { service } = setup()
    const backup = await service.createBackup()
    const corrupted = await rewriteArchive(backup.path, (stage) => {
      const db = new Database(join(stage, 'library.db')); db.pragma('foreign_keys = OFF')
      db.prepare("INSERT INTO aliases VALUES ('bad', 'missing', 'Alias', 'alias', NULL, NULL, '2026-08-17')").run(); db.close()
      updateChecksum(stage, 'library.db')
    })
    await expect(service.previewBackup(corrupted)).rejects.toMatchObject({ code: 'BACKUP_INVALID' })
  })

  it('rejeita backup com schema mais novo do que o aplicativo', async () => {
    const { service } = setup()
    const backup = await service.createBackup()
    const newer = await rewriteArchive(backup.path, (stage) => {
      const manifest = JSON.parse(readFileSync(join(stage, 'manifest.json'), 'utf8')) as Record<string, unknown>
      manifest.schemaVersion = 999; writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest)); updateChecksum(stage, 'manifest.json')
    })
    await expect(service.previewBackup(newer)).rejects.toMatchObject({ code: 'BACKUP_TOO_NEW' })
  })

  it('mantém somente a retenção configurada para backups automáticos', async () => {
    let time = Date.parse('2026-08-01T00:00:00Z')
    const { paths, settings, service } = setup(() => new Date(time))
    settings.updateSettings({ backupRetention: 2, backupFrequency: 'daily' })
    for (let index = 0; index < 4; index += 1) { await service.runAutomaticIfDue(); time += 2 * 86_400_000 }
    expect(readdirSync(paths.backups).filter((name) => name.includes('-auto-'))).toHaveLength(2)
  })

  it('usa a pasta padrão quando a pasta personalizada desapareceu', async () => {
    const { paths, settings, service } = setup()
    settings.updateSettings({ backupDirectory: join(paths.root, 'missing') })
    expect(service.getState().directoryAvailable).toBe(false)
    const backup = await service.createBackup()
    expect(backup.path.startsWith(paths.backups)).toBe(true)
  })

  it('restaura o banco validado e cria um backup before_restore', async () => {
    const { paths, fixture, settings } = setup()
    const before = createMinimalWork(fixture, 'Antes')
    fixture.services.works.updateWork({ id: before.id, hiddenFromHome: true })
    settings.updateSettings({ cardSize: 'large' })
    writeFileSync(join(paths.assets, 'custom.webp'), 'custom original')
    let restarted = false
    const service = new BackupService(fixture.db, paths, settings, new TestLogger(), '0.1.0', 2, { closeDatabase: () => fixture.db.close(), restartApplication: () => { restarted = true } })
    const backup = await service.createBackup()
    createMinimalWork(fixture, 'Depois')
    settings.updateSettings({ cardSize: 'small' })
    writeFileSync(join(paths.assets, 'stale.webp'), 'stale')
    writeFileSync(join(paths.coverCache, 'remote.webp'), 'cache')
    await service.restoreBackup(backup.path)
    const restored = new Database(paths.database, { readonly: true })
    expect((restored.prepare('SELECT COUNT(*) AS count FROM works').get() as { count: number }).count).toBe(1)
    expect(restored.prepare('SELECT hidden_from_home FROM works').pluck().get()).toBe(1)
    restored.close()
    expect(readFileSync(join(paths.assets, 'custom.webp'), 'utf8')).toBe('custom original')
    expect(() => readFileSync(join(paths.assets, 'stale.webp'))).toThrow()
    expect(readdirSync(paths.coverCache)).toHaveLength(0)
    expect(JSON.parse(readFileSync(paths.settings, 'utf8'))).toMatchObject({ cardSize: 'large' })
    expect(readdirSync(paths.backups).some((name) => name.includes('before_restore'))).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(restarted).toBe(true)
  })

  it('rejeita entry com path traversal antes de extrair fora do staging', async () => {
    const root = mkdtempSync(join(tmpdir(), 'auri-zipslip-')); roots.push(root)
    writeFileSync(join(root, 'safe.txt'), 'x')
    const valid = join(root, 'valid.zip'); await createZip(root, ['safe.txt'], valid)
    const bytes = readFileSync(valid)
    const safeName = Buffer.from('safe.txt'); const unsafeName = Buffer.from('../x.txt')
    let offset = 0
    while ((offset = bytes.indexOf(safeName, offset)) >= 0) { unsafeName.copy(bytes, offset); offset += safeName.length }
    const malicious = join(root, 'malicious.auri-backup'); writeFileSync(malicious, bytes)
    const destination = join(root, 'extract')
    await expect(extractZip(malicious, destination)).rejects.toThrow()
    expect(() => readFileSync(join(root, 'x.txt'))).toThrow()
  })
})
