import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { App, BrowserWindow } from 'electron'
import type { MetadataWork } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import type { AppContext, CreateAppContextOptions } from '../app/create-app-context'
import type { MetadataProvider } from '../services/metadata/types'
import type { CoverDownloadClient } from '../services/covers/types'
import type { SafePageFetcher } from '../services/url-metadata/safe-page-fetcher'
import type { UpdaterAdapter } from '../services/update-service'
import type { MainProcessEnvironment } from '../application/environment'
import { registerApplicationSmoke } from './application-smoke'
import { registerScreenshotSmoke } from './screenshot-smoke'
import { registerSettingsScrollSmoke } from './settings-scroll-smoke'

const TEST_COVER_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const TEST_METADATA: MetadataWork = {
  provider: 'anilist', externalId: '987654', title: 'Auri Metadata Test', originalTitle: 'ルミテスト',
  aliases: [{ name: 'Auri Test', kind: 'synonym' }],
  description: 'Metadados determinísticos para validar a integração completa.',
  mediaType: 'manga', publicationStatus: 'ongoing', countryCode: 'JP', startDate: '2026-08', endDate: null,
  creators: [{ name: 'Auri Author', role: 'author' }], genres: ['Teste', 'Fantasia'],
  coverUrl: 'https://fixtures.auri.invalid/cover.png', canonicalUrl: 'https://anilist.co/manga/987654'
}
const TEST_RELEASE_NOTES = '<h1>Auri v1.2.0</h1><p>Uma atualização com <strong>melhorias importantes</strong> e <em>mais clareza</em>.</p><h2>Novidades</h2><ul><li>Janela integrada ao Auri</li><li>Identidade Auri no Windows</li><li>Notas de versão legíveis</li><li>Links externos seguros</li><li>Melhor apresentação do progresso</li><li>Controles nativos preservados</li><li>Atalhos do instalador atualizados</li><li>Restauração de backups legados</li></ul><p>Consulte os <a href="https://example.com/auri-release">detalhes completos</a> ou use <code>Ctrl+K</code>.</p><script>window.__auriUnsafeReleaseNote = true</script><iframe src="https://example.com"></iframe>'

let metadataReads = 0
const metadataProvider: MetadataProvider = {
  id: 'anilist',
  search: async (query) => {
    const normalized = query.trim().toLowerCase()
    if (normalized === 'offline') throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Fixture offline.')
    if (normalized === 'sem resultado') return []
    return [{
      provider: TEST_METADATA.provider, externalId: TEST_METADATA.externalId, title: TEST_METADATA.title,
      originalTitle: TEST_METADATA.originalTitle, mediaType: TEST_METADATA.mediaType,
      publicationStatus: TEST_METADATA.publicationStatus, countryCode: TEST_METADATA.countryCode,
      startDate: TEST_METADATA.startDate, coverUrl: TEST_METADATA.coverUrl, canonicalUrl: TEST_METADATA.canonicalUrl
    }]
  },
  getById: async (id) => {
    if (id !== TEST_METADATA.externalId) return null
    metadataReads += 1
    return metadataReads > 1 ? { ...TEST_METADATA, description: 'Descrição atualizada pela fixture de refresh.' } : TEST_METADATA
  }
}
const coverClient: CoverDownloadClient = { isOnline: () => true, download: async () => TEST_COVER_BYTES }
const pageFetcher = {
  fetch: async (requestedUrl: string) => ({
    requestedUrl,
    finalUrl: 'https://reader.e2e.example/series/url-smoke-work',
    contentType: 'text/html',
    html: '<html><head><meta property="og:title" content="URL Smoke Work"><meta property="og:description" content="Descrição segura detectada no fixture."><meta property="og:site_name" content="Reader E2E"><link rel="canonical" href="https://reader.e2e.example/series/url-smoke-work"></head><body><h1>URL Smoke Work</h1></body></html>'
  })
} as SafePageFetcher
const updateHandlers = new Map<string, Array<(...args: unknown[]) => void>>()
const updaterAdapter = {
  autoDownload: false, autoInstallOnAppQuit: false, channel: null,
  on(event: string, listener: (...args: unknown[]) => void) {
    updateHandlers.set(event, [...(updateHandlers.get(event) ?? []), listener])
  },
  checkForUpdates: async () => null,
  downloadUpdate: async () => [],
  quitAndInstall: () => undefined
} as UpdaterAdapter

export function createSmokeAppContextOptions(environment: MainProcessEnvironment): CreateAppContextOptions {
  if (!environment.isApplicationSmoke && !environment.isScreenshotSmoke) return {}
  return {
    metadataProviders: [metadataProvider],
    coverClient,
    pageFetcher,
    ...(environment.isScreenshotSmoke
      ? { updater: updaterAdapter, updaterEnvironment: { isPackaged: true, isConfigured: true } }
      : {})
  }
}

export function emitInitialSmokeUpdate(environment: MainProcessEnvironment): void {
  if (!environment.isScreenshotSmoke) return
  for (const handler of updateHandlers.get('update-available') ?? []) {
    handler({ version: '1.2.0', releaseNotes: TEST_RELEASE_NOTES })
  }
}

export async function runHeadlessSmoke(
  app: App,
  context: AppContext,
  environment: MainProcessEnvironment
): Promise<boolean> {
  if (environment.isReleasePersistenceSmoke) {
    await runReleasePersistenceSmoke(app, context)
    return true
  }
  if (environment.isReleaseBackupRestoreSmoke) {
    await runReleaseBackupRestoreSmoke(app, context)
    return true
  }
  if (!environment.isBackupSmoke) return false

  const marker = `Packaged Backup ${Date.now()}`
  context.services.works.createWork({ title: marker, mediaType: 'other', userStatus: 'want_to_read' })
  const backup = await context.services.backups.createBackup('manual')
  const preview = await context.services.backups.previewBackup(backup.path)
  const exportPath = join(app.getPath('userData'), 'packaged-export.json')
  context.services.transfer.exportJson(exportPath)
  const importPreview = context.services.transfer.analyzeImport(exportPath)
  if (preview.workCount < 1 || importPreview.total < 1) throw new Error('Backup/export preview vazio.')
  console.log(`AURI_BACKUP_SMOKE_TEST_OK backup=${backup.fileName} works=${preview.workCount}`)
  app.quit()
  return true
}

export function createSmokeIpcOptions(app: App, context: AppContext, environment: MainProcessEnvironment) {
  if (!environment.isApplicationSmoke) return undefined
  const coverPath = join(app.getPath('userData'), 'smoke-cover.png')
  let coverSelectionCount = 0
  writeFileSync(coverPath, TEST_COVER_BYTES)
  return {
    selectCoverFile: async () => ++coverSelectionCount === 1 ? coverPath : null,
    selectBackupDirectory: async () => null,
    selectRestoreFile: async () => null,
    selectExportFile: async () => null,
    searchLibrary: (request: unknown) => {
      if ((request as { query?: string })?.query === 'E2E IPC ERROR') throw new Error('Falha de busca injetada pelo smoke.')
      return context.services.library.searchWorks(request)
    }
  }
}

export function prepareScreenshotFixture(context: AppContext, environment: MainProcessEnvironment): void {
  if (!environment.isScreenshotSmoke) return
  context.services.settings.updateSettings({ sidebarCompact: false, libraryView: 'grid', cardSize: 'medium' })
  for (const work of context.services.library.queryWorks({})) context.services.works.deletePermanently({ workId: work.id })
  for (const work of context.services.works.listTrash()) context.services.works.deletePermanently({ workId: work.id })
  for (const collection of context.services.details.listCollections()) context.services.details.deleteCollection({ collectionId: collection.id })

  const titles = [
    'Nano Machine', 'Eleceed', 'A Leitora Onisciente', 'O Retorno da Vilã', 'Debut or Die',
    'Purple Hyacinth', 'Wind Breaker', 'A Criadora de Heróis', 'Omniscient Reader',
    'The Greatest Estate Developer', 'Villains Are Destined to Die', 'The Boxer',
    'Return of the Blossoming Blade', 'Your Throne', 'SSS-Class Revival Hunter',
    'The Spark in Your Eyes', 'Surviving the Game as a Barbarian', 'The Academy’s Undercover Professor'
  ]
  const statuses = ['reading', 'reading', 'waiting', 'paused', 'want_to_read', 'completed'] as const
  titles.forEach((title, index) => {
    const work = context.services.works.createWork({
      title,
      mediaType: index % 4 === 0 ? 'webtoon' : 'manhwa',
      userStatus: statuses[index % statuses.length],
      chapter: index % 5 === 4 ? undefined : String(18 + index * 11),
      favorite: index % 4 === 0
    })
    if (work.userStatus === 'reading' && work.lastReadChapter?.number != null && index % 3 === 0) {
      context.services.progress.updateProgress({
        workId: work.id,
        chapterLabel: String(work.lastReadChapter.number + 1),
        occurredAt: '2026-06-01T12:00:00.000Z',
        confirmSuspicious: true
      })
    }
  })

  const visualWork = context.services.library.queryWorks({ search: 'Nano Machine' })[0]
  if (!visualWork) return
  context.services.details.updateDetailed({
    work: {
      id: visualWork.id,
      description: 'Após receber uma misteriosa tecnologia, um jovem guerreiro precisa encontrar seu lugar em um mundo de artes marciais.',
      publicationStatus: 'ongoing', countryCode: 'KR', startDate: '2020', rating: 9,
      notes: 'Ritmo excelente e capítulos curtos.', lastReadNote: 'Terminou o arco do torneio.'
    },
    aliases: [{ name: '나노마신', kind: 'original', source: 'user' }],
    creators: [
      { name: 'Han-Joong-Wue', role: 'author', source: 'user' },
      { name: 'Geum-Gang-Bul-Gae', role: 'artist', source: 'user' }
    ],
    genres: ['Ação', 'Fantasia', 'Artes Marciais']
  })
  context.services.details.createTag({ workId: visualWork.id, name: 'Protagonista apelão' })
  context.services.details.createTag({ workId: visualWork.id, name: 'Muito bom' })
  context.services.details.createCollection({ workId: visualWork.id, name: 'Murim favoritos', description: 'Obras de artes marciais.' })
  const source = context.services.sources.createSource({
    workId: visualWork.id, name: 'Scan X', seriesUrl: 'https://scan.example/nano-machine',
    language: 'pt-BR', isPreferred: true
  })
  context.services.progress.updateProgress({
    workId: visualWork.id, chapterLabel: '20', sourceId: source.id,
    note: 'Terminou o arco do torneio.', confirmSuspicious: true
  })
}

export function registerSmokeRunners(mainWindow: BrowserWindow, environment: MainProcessEnvironment): void {
  if (environment.isApplicationSmoke) registerApplicationSmoke(mainWindow)
  if (environment.isSettingsScrollSmoke) registerSettingsScrollSmoke(mainWindow)
  if (environment.isScreenshotSmoke) registerScreenshotSmoke(mainWindow)
}

async function runReleasePersistenceSmoke(app: App, context: AppContext): Promise<void> {
  const markerPath = join(app.getPath('userData'), 'release-persistence-smoke.json')
  if (!existsSync(markerPath)) {
    const collection = context.services.details.createCollection({ name: 'Coleção persistente', description: 'Validação da v1.' })
    const details = context.services.details.createDetailed({
      title: 'Obra persistente da v1', mediaType: 'webtoon', userStatus: 'reading', chapter: '42', favorite: true,
      notes: 'Metadados manuais preservados.', lastReadNote: 'Onde parei na validação.',
      aliases: [{ name: 'Alias persistente', kind: 'alternative', source: 'user' }],
      creators: [{ name: 'Autora persistente', role: 'author', source: 'user' }],
      genres: ['Fantasia'], tags: ['Validação'], collectionIds: [collection.id],
      source: { name: 'Fonte persistente', seriesUrl: 'https://example.com/obra-persistente', language: 'pt-BR', isPreferred: true }
    })
    context.services.progress.incrementProgress({ workId: details.work.id })
    context.services.settings.updateSettings({ libraryView: 'list', librarySort: 'title_asc', cardSize: 'large', sidebarCompact: true, backupAutomatic: false })
    writeFileSync(markerPath, JSON.stringify({ workId: details.work.id }), 'utf8')
    console.log('AURI_RELEASE_PERSISTENCE_TEST_SEEDED')
    app.quit()
    return
  }

  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { workId?: string }
  assertRelease(typeof marker.workId === 'string', 'Marcador de persistência inválido.')
  const details = context.services.details.getDetails({ workId: marker.workId })
  const settings = context.services.settings.getSettings()
  const summary = context.services.library.getSummary()
  const home = context.services.library.getHome()
  assertRelease(details.work.title === 'Obra persistente da v1', 'Obra não persistiu após reiniciar.')
  assertRelease(details.work.lastReadChapter?.label === '43' && details.work.userStatus === 'reading', 'Progresso ou status não persistiu.')
  assertRelease(details.work.favorite && details.work.notes === 'Metadados manuais preservados.' && details.work.lastReadNote === 'Onde parei na validação.', 'Favorito, notas ou Onde parei não persistiu.')
  assertRelease(details.aliases.some((item) => item.name === 'Alias persistente' && item.source === 'user'), 'Alias manual não persistiu.')
  assertRelease(details.collections.some((item) => item.name === 'Coleção persistente') && details.sources.some((item) => item.name === 'Fonte persistente' && item.isPreferred), 'Coleção ou fonte não persistiu.')
  assertRelease(settings.libraryView === 'list' && settings.librarySort === 'title_asc' && settings.cardSize === 'large' && settings.sidebarCompact && !settings.backupAutomatic, 'Preferências não persistiram.')
  assertRelease(summary.total === 1 && summary.favorite === 1 && summary.byStatus.reading === 1 && home.continueReading.some((item) => item.id === marker.workId), 'Agregados ou Home não refletiram os dados persistidos.')
  rmSync(markerPath, { force: true })
  console.log('AURI_RELEASE_PERSISTENCE_TEST_OK')
  app.quit()
}

async function runReleaseBackupRestoreSmoke(app: App, context: AppContext): Promise<void> {
  const markerPath = join(app.getPath('userData'), 'release-backup-restore-smoke.json')
  if (!existsSync(markerPath)) {
    const details = context.services.details.createDetailed({
      title: 'Estado original do backup', mediaType: 'manhwa', userStatus: 'waiting', chapter: '18', favorite: true,
      aliases: [{ name: 'Original preservado', source: 'user' }],
      source: { name: 'Fonte do backup', seriesUrl: 'https://example.com/backup-original', isPreferred: true }
    })
    context.services.settings.updateSettings({ libraryView: 'list', cardSize: 'large', sidebarCompact: true, backupAutomatic: false })
    const backup = await context.services.backups.createBackup('manual')
    writeFileSync(markerPath, JSON.stringify({ workId: details.work.id, backupPath: backup.path }), 'utf8')
    context.services.works.updateWork({ id: details.work.id, title: 'Estado alterado depois do backup', favorite: false, userStatus: 'dropped' })
    context.services.works.createWork({ title: 'Obra criada depois do backup', mediaType: 'other', userStatus: 'want_to_read' })
    context.services.settings.updateSettings({ libraryView: 'grid', cardSize: 'small', sidebarCompact: false })
    await context.services.backups.restoreBackup(backup.path)
    return
  }

  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { workId?: string; backupPath?: string }
  assertRelease(typeof marker.workId === 'string' && typeof marker.backupPath === 'string', 'Marcador de restore inválido.')
  const works = context.services.library.queryWorks({})
  const details = context.services.details.getDetails({ workId: marker.workId })
  const settings = context.services.settings.getSettings()
  const backups = context.services.backups.getState().backups
  assertRelease(works.length === 1 && details.work.title === 'Estado original do backup' && details.work.favorite && details.work.userStatus === 'waiting', 'Banco não retornou ao estado do backup.')
  assertRelease(details.aliases.some((item) => item.name === 'Original preservado') && details.sources.some((item) => item.name === 'Fonte do backup'), 'Dados relacionais não retornaram após restore.')
  assertRelease(settings.libraryView === 'list' && settings.cardSize === 'large' && settings.sidebarCompact && !settings.backupAutomatic, 'Preferências não retornaram após restore.')
  assertRelease(backups.some((item) => item.type === 'before_restore'), 'Backup de segurança before_restore não foi preservado.')
  rmSync(markerPath, { force: true })
  console.log('AURI_RELEASE_BACKUP_RESTORE_TEST_OK')
  app.quit()
}

function assertRelease(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
