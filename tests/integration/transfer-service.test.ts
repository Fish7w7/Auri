import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataPaths, AuriLibraryExport } from '@shared/contracts'
import { BackupService } from '@main/services/backup/backup-service'
import { SettingsService } from '@main/services/settings-service'
import { TransferService } from '@main/services/transfer-service'
import { createDomainFixture } from '../helpers/domain-fixture'
import { TestLogger } from '../helpers/test-logger'
import type Database from 'better-sqlite3'

const roots: string[] = []
const databases: Database.Database[] = []
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function setup(name: string) {
  const root = mkdtempSync(join(tmpdir(), `auri-transfer-${name}-`)); roots.push(root)
  const paths: DataPaths = { root, database: join(root, 'data', 'library.sqlite'), assets: join(root, 'assets'), coverCache: join(root, 'cache', 'covers'), backups: join(root, 'backups'), logs: join(root, 'logs'), settings: join(root, 'settings.json') }
  for (const path of [join(root, 'data'), paths.assets, paths.coverCache, paths.backups, paths.logs]) mkdirSync(path, { recursive: true })
  const fixture = createDomainFixture(paths.database)
  databases.push(fixture.db)
  const settings = new SettingsService(paths.settings, new TestLogger())
  const backups = new BackupService(fixture.db, paths, settings, new TestLogger(), '0.1.0', 2)
  const transfer = new TransferService(fixture.db, { ...fixture.repositories }, fixture.services.details, backups, new TestLogger(), () => '2026-08-17T12:00:00.000Z')
  return { root, paths, fixture, transfer }
}

function createRichWork(target: ReturnType<typeof setup>, title = 'The Shepherd Wizard') {
  const details = target.fixture.services.details.createDetailed({
    title, mediaType: 'manhwa', userStatus: 'reading', chapter: '42', rating: 8.5, favorite: true, hiddenFromHome: true,
    aliases: [{ name: 'Yangchigi Mabeopsa', kind: 'romanized', source: 'anilist' }],
    externalRefs: [{ provider: 'anilist', externalId: '123', canonicalUrl: 'https://anilist.co/manga/123' }],
    creators: [{ name: 'Autora', role: 'author' }], genres: ['Fantasia'], tags: ['Magia']
  })
  const collection = target.fixture.services.details.createCollection({ name: 'Favoritos', workId: details.work.id })
  target.fixture.services.sources.createSource({ workId: details.work.id, seriesUrl: 'https://reader.example/series', isPreferred: true })
  target.fixture.services.progress.updateProgress({ workId: details.work.id, chapterLabel: '43', confirmed: true })
  return { details, collection }
}

describe('TransferService', () => {
  it('exporta JSON de domínio e importa obra nova com relações sem duplicar IDs externos', async () => {
    const source = setup('source'); createRichWork(source)
    const file = join(source.root, 'library.json'); source.transfer.exportJson(file)
    const target = setup('target')
    const preview = target.transfer.analyzeImport(file)
    expect(preview).toMatchObject({ total: 1, newWorks: 1, conflicts: 0 })
    const result = await target.transfer.applyImport(file)
    expect(result).toMatchObject({ created: 1, merged: 0, skipped: 0 })
    const imported = target.fixture.services.library.queryWorks({ search: 'Yangchigi' })[0]
    const details = target.fixture.services.details.getDetails({ workId: imported.id })
    expect(details.externalRefs).toHaveLength(1)
    expect(details.genres.map((item) => item.name)).toContain('Fantasia')
    expect(details.tags.map((item) => item.name)).toContain('Magia')
    expect(details.collections.map((item) => item.name)).toContain('Favoritos')
    expect(target.fixture.repositories.history.listByWork(imported.id).length).toBeGreaterThan(0)
    expect(imported.hiddenFromHome).toBe(true)
  })

  it('assume visível quando um JSON antigo não possui hiddenFromHome', async () => {
    const source = setup('legacy-json-source'); createRichWork(source)
    const file = join(source.root, 'legacy-library.json'); source.transfer.exportJson(file)
    const payload = JSON.parse(readFileSync(file, 'utf8')) as AuriLibraryExport
    expect(payload.works[0].work.hiddenFromHome).toBe(true)
    Reflect.deleteProperty(payload.works[0].work, 'hiddenFromHome')
    writeFileSync(file, JSON.stringify(payload))
    const target = setup('legacy-json-target')
    await target.transfer.applyImport(file)
    expect(target.fixture.services.library.queryWorks({})[0].hiddenFromHome).toBe(false)
  })

  it('exporta CSV com BOM e escape correto', () => {
    const source = setup('csv'); createRichWork(source, 'Título, "Especial"')
    const file = join(source.root, 'library.csv'); source.transfer.exportCsv(file)
    const csv = readFileSync(file, 'utf8')
    expect(csv.startsWith('\ufeffTítulo,')).toBe(true)
    expect(csv).toContain('"Título, ""Especial"""')
  })

  it('rejeita JSON corrompido e versão futura sem alterar a biblioteca', () => {
    const target = setup('invalid')
    const corrupt = join(target.root, 'corrupt.json'); writeFileSync(corrupt, '{')
    expect(() => target.transfer.analyzeImport(corrupt)).toThrowError(expect.objectContaining({ code: 'IMPORT_INVALID' }))
    const future = join(target.root, 'future.json'); writeFileSync(future, JSON.stringify({ format: 'auri-library', version: 99, exportedAt: '', works: [] }))
    expect(() => target.transfer.analyzeImport(future)).toThrowError(expect.objectContaining({ code: 'IMPORT_UNSUPPORTED_VERSION' }))
    expect(target.fixture.services.library.queryWorks({})).toHaveLength(0)
  })

  it('detecta conflito por ID externo e não sobrescreve sem escolha explícita', async () => {
    const source = setup('conflict-source'); createRichWork(source)
    const file = join(source.root, 'library.json'); source.transfer.exportJson(file)
    const target = setup('conflict-target')
    const current = target.fixture.services.works.createWork({ title: 'Meu título', mediaType: 'manhwa', userStatus: 'completed', rating: 10, externalRefs: [{ provider: 'anilist', externalId: '123' }] })
    expect(target.transfer.analyzeImport(file)).toMatchObject({ exactMatches: 1, conflicts: 1 })
    await expect(target.transfer.applyImport(file)).rejects.toMatchObject({ code: 'IMPORT_CONFLICT' })
    expect(target.fixture.services.works.getWork({ workId: current.id })).toMatchObject({ title: 'Meu título', userStatus: 'completed', rating: 10 })
  })

  it('mantém dados pessoais atuais ou usa os importados conforme a escolha e cria backup especial', async () => {
    const source = setup('merge-source'); createRichWork(source)
    const file = join(source.root, 'library.json'); source.transfer.exportJson(file)
    const target = setup('merge-target')
    const current = target.fixture.services.works.createWork({ title: 'Meu título', mediaType: 'manhwa', userStatus: 'completed', rating: 10, externalRefs: [{ provider: 'anilist', externalId: '123' }] })
    await target.transfer.applyImport(file, 'keep_current')
    expect(target.fixture.services.works.getWork({ workId: current.id })).toMatchObject({ title: 'Meu título', userStatus: 'completed', rating: 10 })
    expect(target.fixture.services.details.getDetails({ workId: current.id }).aliases.map((item) => item.name)).toContain('Yangchigi Mabeopsa')
    expect(target.fixture.services.details.getDetails({ workId: current.id }).externalRefs).toHaveLength(1)
    expect(target.fixture.services.library.queryWorks({ search: 'The Shepherd Wizard' })).toHaveLength(1)
    expect(target.fixture.services.library.queryWorks({ search: 'Yangchigi Mabeopsa' })).toHaveLength(1)
    expect(readdirSync(target.paths.backups).some((name) => name.includes('before_import'))).toBe(true)
    await target.transfer.applyImport(file, 'use_imported')
    expect(target.fixture.services.works.getWork({ workId: current.id })).toMatchObject({ title: 'The Shepherd Wizard', userStatus: 'reading', rating: 8.5 })
  })

  it('não mescla correspondência apenas provável de forma silenciosa', async () => {
    const source = setup('probable-source'); createRichWork(source)
    const file = join(source.root, 'library.json')
    const payload = JSON.parse(JSON.stringify(source.transfer.exportJson(file) && JSON.parse(readFileSync(file, 'utf8')))) as AuriLibraryExport
    payload.works[0].externalRefs = []; writeFileSync(file, JSON.stringify(payload))
    const target = setup('probable-target')
    target.fixture.services.works.createWork({ title: 'The Shepherd Wizard', mediaType: 'manhwa', userStatus: 'reading' })
    expect(target.transfer.analyzeImport(file)).toMatchObject({ probableMatches: 1 })
    const result = await target.transfer.applyImport(file)
    expect(result).toMatchObject({ created: 0, merged: 0, skipped: 1 })
    expect(target.fixture.services.library.queryWorks({})).toHaveLength(1)
  })
})
