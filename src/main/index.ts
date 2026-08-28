import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, shell } from 'electron'
import { createAppContext, type AppContext } from './app/create-app-context'
import { registerIpcHandlers } from './ipc/register-ipc-handlers'
import { createMainWindow } from './windows/create-main-window'
import type { MetadataProvider } from './services/metadata/types'
import type { CoverDownloadClient } from './services/covers/types'
import type { MetadataWork } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { resolveDataPaths } from './app/data-paths'
import { JsonLogger } from './logging/logger'
import { classifyDatabaseOpenFailure, createRecoveryBackupService } from './services/database-recovery-service'
import type { SafePageFetcher } from './services/url-metadata/safe-page-fetcher'
import type { UpdaterAdapter } from './services/update-service'
import { APP_BRAND } from '@shared/constants/app-branding'
import { APP_USER_MODEL_ID, CURRENT_LOG_FILE_NAME } from './app/app-identity'

let context: AppContext | undefined
let unregisterIpc: (() => void) | undefined
const isSmokeTest = process.argv.includes('--smoke-test')
const isScreenshotTest = process.argv.includes('--screenshot-test')
const isSettingsScrollTest = process.argv.includes('--settings-scroll-test')
const isBackupSmokeTest = process.argv.includes('--backup-smoke-test')
const isReleasePersistenceSmokeTest = process.argv.includes('--release-persistence-smoke-test')
const isReleaseBackupRestoreTest = process.argv.includes('--release-backup-restore-test')
const isReleaseDataSmokeTest = isReleasePersistenceSmokeTest || isReleaseBackupRestoreTest
const testCoverBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const testMetadata: MetadataWork = { provider: 'anilist', externalId: '987654', title: 'Auri Metadata Test', originalTitle: 'ルミテスト', aliases: [{ name: 'Auri Test', kind: 'synonym' }], description: 'Metadados determinísticos para validar a integração completa.', mediaType: 'manga', publicationStatus: 'ongoing', countryCode: 'JP', startDate: '2026-08', endDate: null, creators: [{ name: 'Auri Author', role: 'author' }], genres: ['Teste', 'Fantasia'], coverUrl: 'https://fixtures.auri.invalid/cover.png', canonicalUrl: 'https://anilist.co/manga/987654' }
let testMetadataReads = 0
const testMetadataProvider: MetadataProvider = { id: 'anilist', search: async (query) => { const normalized = query.trim().toLowerCase(); if (normalized === 'offline') throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Fixture offline.'); if (normalized === 'sem resultado') return []; return [{ provider: testMetadata.provider, externalId: testMetadata.externalId, title: testMetadata.title, originalTitle: testMetadata.originalTitle, mediaType: testMetadata.mediaType, publicationStatus: testMetadata.publicationStatus, countryCode: testMetadata.countryCode, startDate: testMetadata.startDate, coverUrl: testMetadata.coverUrl, canonicalUrl: testMetadata.canonicalUrl }] }, getById: async (id) => { if (id !== testMetadata.externalId) return null; testMetadataReads += 1; return testMetadataReads > 1 ? { ...testMetadata, description: 'Descrição atualizada pela fixture de refresh.' } : testMetadata } }
const testCoverClient: CoverDownloadClient = { isOnline: () => true, download: async () => testCoverBytes }
const testPageFetcher = { fetch: async (requestedUrl: string) => ({ requestedUrl, finalUrl: 'https://reader.e2e.example/series/url-smoke-work', contentType: 'text/html', html: '<html><head><meta property="og:title" content="URL Smoke Work"><meta property="og:description" content="Descrição segura detectada no fixture."><meta property="og:site_name" content="Reader E2E"><link rel="canonical" href="https://reader.e2e.example/series/url-smoke-work"></head><body><h1>URL Smoke Work</h1></body></html>' }) } as SafePageFetcher
const testUpdateHandlers = new Map<string, Array<(...args: unknown[]) => void>>()
const testUpdaterAdapter = {
  autoDownload: false, autoInstallOnAppQuit: false, channel: null,
  on(event: string, listener: (...args: unknown[]) => void) { testUpdateHandlers.set(event, [...(testUpdateHandlers.get(event) ?? []), listener]) },
  checkForUpdates: async () => null, downloadUpdate: async () => [], quitAndInstall: () => undefined
} as UpdaterAdapter
const testReleaseNotes = '<h1>Auri v1.2.0</h1><p>Uma atualização com <strong>melhorias importantes</strong> e <em>mais clareza</em>.</p><h2>Novidades</h2><ul><li>Janela integrada ao Auri</li><li>Identidade Auri no Windows</li><li>Notas de versão legíveis</li><li>Links externos seguros</li><li>Melhor apresentação do progresso</li><li>Controles nativos preservados</li><li>Atalhos do instalador atualizados</li><li>Restauração de backups legados</li></ul><p>Consulte os <a href="https://example.com/auri-release">detalhes completos</a> ou use <code>Ctrl+K</code>.</p><script>window.__auriUnsafeReleaseNote = true</script><iframe src="https://example.com"></iframe>'

async function captureNativeWindow(window: BrowserWindow, destination: string): Promise<void> {
  const bounds = window.getBounds()
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: bounds.width, height: bounds.height }, fetchWindowIcons: false })
  const source = sources.find((candidate) => candidate.name === APP_BRAND.name) ?? sources.find((candidate) => candidate.name.includes(APP_BRAND.name))
  if (!source || source.thumbnail.isEmpty()) throw new Error('A captura nativa da janela do Auri não foi encontrada.')
  writeFileSync(destination, source.thumbnail.toPNG())
}

function emitTestUpdate(event: string, value: unknown): void {
  for (const handler of testUpdateHandlers.get(event) ?? []) handler(value)
}

app.setName(APP_BRAND.name)
app.setAppUserModelId(APP_USER_MODEL_ID)
if (isSmokeTest || isScreenshotTest || isSettingsScrollTest || isBackupSmokeTest || isReleaseDataSmokeTest) app.disableHardwareAcceleration()
if (isSmokeTest || isScreenshotTest || isSettingsScrollTest || isBackupSmokeTest || isReleaseDataSmokeTest) app.commandLine.appendSwitch('in-process-gpu')
if (isSmokeTest || isScreenshotTest || isSettingsScrollTest || isBackupSmokeTest || isReleaseDataSmokeTest) {
  app.setPath(
    'userData',
    join(app.getPath('temp'), isScreenshotTest ? 'auri-screenshot-test' : isSettingsScrollTest ? 'auri-settings-scroll-test' : isBackupSmokeTest ? 'auri-backup-smoke-test' : isReleasePersistenceSmokeTest ? 'auri-release-persistence-test' : isReleaseBackupRestoreTest ? 'auri-release-backup-restore-test' : 'auri-smoke-test')
  )
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.whenReady().then(async () => {
    try {
      context = await createAppContext(app, isSmokeTest || isScreenshotTest ? {
        metadataProviders: [testMetadataProvider], coverClient: testCoverClient, pageFetcher: testPageFetcher,
        ...(isScreenshotTest ? { updater: testUpdaterAdapter, updaterEnvironment: { isPackaged: true, isConfigured: true } } : {})
      } : {})
      if (isScreenshotTest) emitTestUpdate('update-available', { version: '1.2.0', releaseNotes: testReleaseNotes })
      if (isReleasePersistenceSmokeTest) {
        try { await runReleasePersistenceSmoke(context) } catch (error) { console.error('AURI_RELEASE_PERSISTENCE_TEST_FAILED', error); app.exit(1) }
        return
      }
      if (isReleaseBackupRestoreTest) {
        try { await runReleaseBackupRestoreSmoke(context) } catch (error) { console.error('AURI_RELEASE_BACKUP_RESTORE_TEST_FAILED', error); app.exit(1) }
        return
      }
      if (isBackupSmokeTest) {
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
        return
      }
      const smokeCoverPath = isSmokeTest ? join(app.getPath('userData'), 'smoke-cover.png') : null
      let smokeCoverSelectionCount = 0
      if (smokeCoverPath) {
        writeFileSync(smokeCoverPath, testCoverBytes)
      }
      unregisterIpc = registerIpcHandlers(
        {
          system: context.services.system,
          works: context.services.works,
          progress: context.services.progress,
          sources: context.services.sources,
          library: context.services.library,
          settings: context.services.settings,
          details: context.services.details,
          assets: context.services.assets,
          covers: context.services.covers,
          metadata: context.services.metadata,
          urlMetadata: context.services.urlMetadata,
          externalNavigation: context.services.externalNavigation,
          backups: context.services.backups,
          transfer: context.services.transfer,
          updates: context.services.updates,
          bulk: context.services.bulk
        },
        context.logger,
        smokeCoverPath ? {
          selectCoverFile: async () => ++smokeCoverSelectionCount === 1 ? smokeCoverPath : null,
          selectBackupDirectory: async () => null,
          selectRestoreFile: async () => null,
          selectExportFile: async () => null,
          searchLibrary: (request) => {
            if ((request as { query?: string })?.query === 'E2E IPC ERROR') throw new Error('Falha de busca injetada pelo smoke.')
            return context!.services.library.searchWorks(request)
          }
        } : undefined
      )
      void context.services.backups.runAutomaticIfDue().catch((error: unknown) => {
        context?.logger.error('backup', 'Falha no backup automático em segundo plano.', { event: 'backup.auto_failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
      })
      if (!isSmokeTest && !isScreenshotTest && !isSettingsScrollTest && !isBackupSmokeTest && !isReleaseDataSmokeTest && !context.services.updates.isDevelopmentMock) {
        void context.services.updates.checkForUpdates().catch(() => { /* estado e logging são tratados pelo serviço */ })
      }
      if (isScreenshotTest) {
        context.services.settings.updateSettings({ sidebarCompact: false, libraryView: 'grid', cardSize: 'medium' })
        for (const work of context.services.library.queryWorks({})) {
          context.services.works.deletePermanently({ workId: work.id })
        }
        for (const work of context.services.works.listTrash()) {
          context.services.works.deletePermanently({ workId: work.id })
        }
        for (const collection of context.services.details.listCollections()) {
          context.services.details.deleteCollection({ collectionId: collection.id })
        }
        const titles = [
          'Nano Machine', 'Eleceed', 'A Leitora Onisciente', 'O Retorno da Vilã',
          'Debut or Die', 'Purple Hyacinth', 'Wind Breaker', 'A Criadora de Heróis',
          'Omniscient Reader', 'The Greatest Estate Developer', 'Villains Are Destined to Die',
          'The Boxer', 'Return of the Blossoming Blade', 'Your Throne', 'SSS-Class Revival Hunter',
          'The Spark in Your Eyes', 'Surviving the Game as a Barbarian', 'The Academy’s Undercover Professor'
        ]
        const statuses = ['reading', 'reading', 'waiting', 'paused', 'want_to_read', 'completed'] as const
        titles.forEach((title, index) => {
          const work = context!.services.works.createWork({
            title,
            mediaType: index % 4 === 0 ? 'webtoon' : 'manhwa',
            userStatus: statuses[index % statuses.length],
            chapter: index % 5 === 4 ? undefined : String(18 + index * 11),
            favorite: index % 4 === 0
          })
          if (work.userStatus === 'reading' && work.lastReadChapter?.number != null && index % 3 === 0) {
            context!.services.progress.updateProgress({
              workId: work.id,
              chapterLabel: String(work.lastReadChapter.number + 1),
              occurredAt: '2026-06-01T12:00:00.000Z',
              confirmSuspicious: true
            })
          }
        })
        const visualWork = context.services.library.queryWorks({ search: 'Nano Machine' })[0]
        if (visualWork) {
          context.services.details.updateDetailed({
            work: { id: visualWork.id, description: 'Após receber uma misteriosa tecnologia, um jovem guerreiro precisa encontrar seu lugar em um mundo de artes marciais.', publicationStatus: 'ongoing', countryCode: 'KR', startDate: '2020', rating: 9, notes: 'Ritmo excelente e capítulos curtos.', lastReadNote: 'Terminou o arco do torneio.' },
            aliases: [{ name: '나노마신', kind: 'original', source: 'user' }],
            creators: [{ name: 'Han-Joong-Wue', role: 'author', source: 'user' }, { name: 'Geum-Gang-Bul-Gae', role: 'artist', source: 'user' }],
            genres: ['Ação', 'Fantasia', 'Artes Marciais']
          })
          context.services.details.createTag({ workId: visualWork.id, name: 'Protagonista apelão' })
          context.services.details.createTag({ workId: visualWork.id, name: 'Muito bom' })
          context.services.details.createCollection({ workId: visualWork.id, name: 'Murim favoritos', description: 'Obras de artes marciais.' })
          const source = context.services.sources.createSource({ workId: visualWork.id, name: 'Scan X', seriesUrl: 'https://scan.example/nano-machine', language: 'pt-BR', isPreferred: true })
          context.services.progress.updateProgress({ workId: visualWork.id, chapterLabel: '20', sourceId: source.id, note: 'Terminou o arco do torneio.', confirmSuspicious: true })
        }
      }

      const mainWindow = createMainWindow({
        showWhenReady: !isSmokeTest && !isSettingsScrollTest,
        keepRenderingWhenHidden: isSmokeTest || isScreenshotTest || isSettingsScrollTest
      })

      if (isSmokeTest) {
        mainWindow.webContents.once('did-finish-load', () => {
          void runNativeWindowStateSmoke(mainWindow).then(() => mainWindow.webContents
            .executeJavaScript(`
              (async () => {
                const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
                const waitFor = async (getter, label, timeout = 15000) => {
                  const started = Date.now()
                  while (Date.now() - started < timeout) {
                    const value = await getter()
                    if (value) return value
                    await sleep(40)
                  }
                  throw new Error('E2E timeout: ' + label)
                }
                const byText = (root, text) => Array.from(root.querySelectorAll('button')).find(
                  (button) => button.textContent.trim() === text || Array.from(button.children).some((child) => child.textContent.trim() === text)
                )
                const latestDialog = () => Array.from(document.querySelectorAll('dialog[open]')).at(-1)
                const setInput = (input, value) => {
                  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
                  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value)
                  input.dispatchEvent(new Event('input', { bubbles: true }))
                }
                const chooseSelect = async (label, optionText) => {
                  const trigger = await waitFor(() => document.querySelector('button[aria-label="' + label + '"]'), 'select ' + label)
                  trigger.click()
                  const list = await waitFor(() => document.querySelector('[role="listbox"][aria-label="' + label + '"]'), 'opções ' + label)
                  const option = Array.from(list.querySelectorAll('button')).find((button) => button.textContent.includes(optionText))
                  if (!option) throw new Error('Opção ausente: ' + optionText)
                  option.click()
                  await sleep(80)
                }
                const testTitle = 'Auri E2E Work'
                const quickActionsTitle = 'Auri Quick Actions E2E'
                const status = await window.auri.system.getStatus()
                for (const cleanupTitle of [testTitle, quickActionsTitle, 'Auri Metadata Test', 'Meu título importado', 'Offline Manual E2E', 'URL Smoke Work']) for (const item of await window.auri.library.query({ search: cleanupTitle })) await window.auri.works.deletePermanently({ workId: item.id })
                for (const item of await window.auri.works.listTrash()) if (item.title === testTitle) await window.auri.works.deletePermanently({ workId: item.id })
                for (const collection of await window.auri.collections.list()) if (collection.name === 'Murim favoritos E2E') await window.auri.collections.delete({ collectionId: collection.id })
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'Biblioteca inicial')

                // Sidebar compacta mantém o controle acessível e suporta ciclos repetidos.
                let sidebarToggle = document.querySelector('button[aria-label="Recolher sidebar"]')
                if (!sidebarToggle) {
                  document.querySelector('button[aria-label="Expandir sidebar"]').click()
                  sidebarToggle = await waitFor(() => document.querySelector('button[aria-label="Recolher sidebar"]'), 'normalizar sidebar expandida')
                }
                sidebarToggle.click()
                await waitFor(() => document.querySelector('.sidebar--compact button[aria-label="Expandir sidebar"]'), 'sidebar recolhida')
                document.querySelector('button[aria-label="Expandir sidebar"]').click()
                await waitFor(() => document.querySelector('.sidebar:not(.sidebar--compact) button[aria-label="Recolher sidebar"]'), 'sidebar expandida')
                document.querySelector('button[aria-label="Recolher sidebar"]').click()
                await waitFor(() => document.querySelector('.sidebar--compact button[aria-label="Expandir sidebar"]'), 'segundo recolhimento')
                if (!(await window.auri.settings.get()).sidebarCompact) throw new Error('Sidebar compacta não foi persistida após o ciclo.')

                // Atalhos contextuais não interferem com campos e Ctrl+N reutiliza o cadastro existente.
                document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
                const librarySearch = document.querySelector('.library-page .search-field input')
                if (document.activeElement !== librarySearch) throw new Error('Atalho / não focou a pesquisa da Biblioteca.')
                librarySearch.blur()

                // A — cadastro rápido e abertura da rota interna.
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))
                let modal = await waitFor(latestDialog, 'escolha de cadastro')
                byText(modal, 'Adicionar rapidamente').click()
                await sleep(60)
                modal = latestDialog()
                setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), testTitle)
                setInput(modal.querySelector('input[placeholder="183, 10A ou Prólogo"]'), '183')
                byText(modal, 'Adicionar').click()
                const work = await waitFor(async () => (await window.auri.library.query({ search: testTitle }))[0], 'obra criada')
                await waitFor(() => byText(document, 'Abrir obra'), 'ação Abrir obra')
                await waitFor(() => !document.querySelector('dialog[open]'), 'cadastro rápido fechado')
                if (!(await window.auri.settings.get()).sidebarCompact) throw new Error('Cadastro resetou a preferência da sidebar.')

                // Ações rápidas permanecem acima da capa, funcionam no primeiro clique e não navegam.
                const quickWork = await window.auri.works.create({ title: quickActionsTitle, mediaType: 'manhwa', userStatus: 'reading', chapter: '10' })
                window.dispatchEvent(new Event('auri:data-changed'))
                const findQuickCard = (selector = '.work-card') => Array.from(document.querySelectorAll(selector)).find((card) => card.querySelector('h3, strong')?.textContent === quickActionsTitle)
                const assertActionLayer = async (card, label) => {
                  const overlay = card?.querySelector('.work-actions')
                  const openControl = card?.querySelector('.work-card__open, .work-list-row__open')
                  const action = card?.querySelector('button[aria-label="' + label + '"]')
                  if (!overlay || !openControl || !action) throw new Error('Ação rápida ausente: ' + label)
                  const overlayLayer = Number(getComputedStyle(overlay).zIndex)
                  const cardIsolation = getComputedStyle(card).isolation
                  if (!card.isConnected || !Number.isFinite(overlayLayer) || overlayLayer < 1 || (card.matches('.work-card') && cardIsolation !== 'isolate')) throw new Error('Camada das ações rápidas não está isolada acima da capa: ' + label)
                  return action
                }
                let gridControl = document.querySelector('button[aria-label="Visualização em grade"]')
                if (!gridControl.classList.contains('is-active')) gridControl.click()
                await waitFor(() => document.querySelector('.virtual-library--grid'), 'grade para ações rápidas')
                let quickCard = await waitFor(() => findQuickCard(), 'card de ações rápidas')
                quickCard.querySelector('.work-card__open').click()
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === quickActionsTitle, 'abertura normal do card')
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.virtual-library--grid'), 'retorno à grade após abertura normal')
                quickCard = await waitFor(() => findQuickCard(), 'card para favoritar')
                ;(await assertActionLayer(quickCard, 'Adicionar aos favoritos')).click()
                await waitFor(async () => (await window.auri.works.get({ workId: quickWork.id })).favorite, 'favorito no primeiro clique')
                if (document.querySelector('.work-page')) throw new Error('Favoritar abriu a obra.')
                quickCard = await waitFor(() => findQuickCard(), 'card para +1')
                ;(await assertActionLayer(quickCard, 'Avançar um capítulo')).click()
                await waitFor(async () => (await window.auri.works.get({ workId: quickWork.id })).lastReadChapter?.label === '11', '+1 exato no primeiro clique')
                if (document.querySelector('.work-page')) throw new Error('+1 abriu a obra.')
                const listControl = document.querySelector('button[aria-label="Visualização em lista"]')
                listControl.click()
                await waitFor(() => document.querySelector('.virtual-library--list'), 'lista para ações rápidas')
                let quickRow = await waitFor(() => findQuickCard('.work-list-row'), 'linha para desfavoritar')
                ;(await assertActionLayer(quickRow, 'Remover dos favoritos')).click()
                await waitFor(async () => !(await window.auri.works.get({ workId: quickWork.id })).favorite, 'desfavoritar na lista')
                if (document.querySelector('.work-page')) throw new Error('Desfavoritar abriu a obra.')
                gridControl = document.querySelector('button[aria-label="Visualização em grade"]')
                gridControl.click()
                await waitFor(() => document.querySelector('.virtual-library--grid'), 'grade para Lixeira')
                quickCard = await waitFor(() => findQuickCard(), 'card para Lixeira')
                ;(await assertActionLayer(quickCard, 'Mover para a Lixeira')).click()
                modal = await waitFor(latestDialog, 'confirmação da ação rápida Lixeira')
                if (document.querySelector('.work-page')) throw new Error('Lixeira abriu a obra antes da confirmação.')
                byText(modal, 'Mover para a Lixeira').click()
                await waitFor(async () => !(await window.auri.library.query({ search: quickActionsTitle }))[0], 'remoção pela ação rápida')
                if (document.querySelector('.work-page')) throw new Error('Lixeira abriu a obra após a confirmação.')

                // Tamanhos de card mudam as colunas sem resetar a sidebar compacta.
                const cardColumns = {}
                for (const [value, label] of [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']]) {
                  window.location.hash = '/settings'
                  await waitFor(() => document.querySelector('.settings-page'), 'Configurações para tamanho ' + label)
                  const sizeButton = await waitFor(() => Array.from(document.querySelectorAll('.size-segmented button')).find((button) => button.textContent.trim() === label), 'controle de tamanho ' + label)
                  sizeButton.click()
                  await waitFor(async () => (await window.auri.settings.get()).cardSize === value, 'persistência do tamanho ' + label)
                  const persistedSidebar = (await window.auri.settings.get()).sidebarCompact
                  if (!document.querySelector('.sidebar--compact button[aria-label="Expandir sidebar"]') || !persistedSidebar) throw new Error('Sidebar foi resetada ao mudar tamanho dos cards: persistida=' + persistedSidebar)
                  window.location.hash = '/library'
                  const gridButton = await waitFor(() => document.querySelector('button[aria-label="Visualização em grade"]'), 'controle de grade')
                  if (!gridButton.classList.contains('is-active')) gridButton.click()
                  const library = await waitFor(() => document.querySelector('.virtual-library--grid[data-card-size="' + value + '"]'), 'grade ' + label)
                  cardColumns[value] = Number(library.dataset.columns)
                }
                if (!(cardColumns.small > cardColumns.medium && cardColumns.medium > cardColumns.large)) throw new Error('Tamanhos de card não produziram colunas distintas: ' + JSON.stringify(cardColumns))
                document.querySelector('button[aria-label="Expandir sidebar"]').click()
                await waitFor(() => document.querySelector('.sidebar:not(.sidebar--compact)'), 'sidebar expandida após configurações')
                document.activeElement?.blur()
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.quick-search)'), 'busca rápida local')
                const quickSearch = modal.querySelector('.quick-search input')
                setInput(quickSearch, testTitle)
                await waitFor(() => modal.querySelector('.quick-search__results button'), 'resultado da busca rápida')
                quickSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === testTitle, 'página da obra')

                // B — edição atômica com descrição, alias e tag.
                const openWorkMenu = () => { const menu = document.querySelector('.work-overflow'); menu.open = true; return menu }
                byText(openWorkMenu(), 'Editar obra').click()
                modal = await waitFor(latestDialog, 'edição da obra')
                setInput(modal.querySelector('textarea[placeholder="Sinopse ou contexto da obra…"]'), 'Descrição persistida pelo fluxo E2E.')
                byText(modal, 'Adicionar título').click()
                await sleep(40)
                setInput(modal.querySelector('input[aria-label="Título alternativo"]'), 'E2E Alternative')
                const tagInput = modal.querySelector('.tag-input input')
                setInput(tagInput, 'Murim E2E')
                tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
                await waitFor(() => Array.from(modal.querySelectorAll('.tag-input button')).some((item) => item.textContent.includes('Murim E2E')), 'tag no formulário')
                modal.querySelector('textarea[placeholder="Sinopse ou contexto da obra…"]').dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
                await waitFor(() => document.querySelector('.work-description')?.textContent.includes('Descrição persistida'), 'descrição salva')
                await waitFor(() => Array.from(document.querySelectorAll('.detail-chips span')).some((item) => item.textContent.includes('E2E Alternative')), 'alias salvo')

                // C — fonte derivando domínio e tornando-se preferida.
                byText(document.querySelector('.no-source-callout'), 'Adicionar fonte').click()
                modal = await waitFor(latestDialog, 'adicionar fonte')
                setInput(modal.querySelector('input[placeholder="https://scan.example/obra"]'), 'https://scan.e2e.example/auri')
                modal.querySelector('input[type="checkbox"]').click()
                byText(modal, 'Adicionar').click()
                await waitFor(() => document.querySelector('.source-row strong')?.textContent.includes('★'), 'fonte preferida')
                let sourceMenu = document.querySelector('.source-menu')
                sourceMenu.open = true
                byText(sourceMenu, 'Editar').click()
                modal = await waitFor(latestDialog, 'editar fonte preferida')
                modal.querySelector('input[type="checkbox"]').click()
                byText(modal, 'Salvar').click()
                await waitFor(() => !document.querySelector('.source-row strong')?.textContent.includes('★'), 'preferência removida')
                sourceMenu = document.querySelector('.source-menu')
                sourceMenu.open = true
                byText(sourceMenu, 'Editar').click()
                modal = await waitFor(latestDialog, 'redefinir fonte preferida')
                modal.querySelector('input[type="checkbox"]').click()
                byText(modal, 'Salvar').click()
                await waitFor(() => document.querySelector('.source-row strong')?.textContent.includes('★'), 'preferência redefinida')

                // D — edição de progresso, histórico e undo.
                byText(document.querySelector('.progress-controls'), 'Editar').click()
                modal = await waitFor(latestDialog, 'editar progresso')
                setInput(modal.querySelector('input[placeholder="191.5, 10A ou Prólogo"]'), '191')
                byText(modal, 'Salvar').click()
                await waitFor(() => document.querySelector('.progress-number')?.textContent === '191', 'progresso 191')
                ;(await waitFor(() => byText(document, 'Desfazer alteração'), 'undo do histórico')).click()
                await waitFor(() => document.querySelector('.progress-number')?.textContent === '183', 'progresso desfeito')

                // E — criar coleção e associar automaticamente.
                const collectionSection = Array.from(document.querySelectorAll('.work-section')).find((section) => section.querySelector('h2')?.textContent === 'Coleções')
                byText(collectionSection, '+ Nova coleção').click()
                modal = await waitFor(latestDialog, 'nova coleção')
                setInput(modal.querySelector('input'), 'Murim favoritos E2E')
                byText(modal, 'Criar').click()
                await waitFor(() => Array.from(document.querySelectorAll('.collection-checklist label')).some((label) => label.textContent.includes('Murim favoritos E2E') && label.querySelector('input').checked), 'coleção associada')

                // Página de Coleções lista e abre suas obras usando a Biblioteca existente.
                window.location.hash = '/collections'
                const collectionRow = await waitFor(() => Array.from(document.querySelectorAll('.collection-row')).find((row) => row.textContent.includes('Murim favoritos E2E')), 'coleção na página')
                collectionRow.querySelector('.collection-row__main').click()
                await waitFor(() => document.querySelector('.library-page h1')?.textContent === 'Murim favoritos E2E', 'coleção aberta')
                await waitFor(() => Array.from(document.querySelectorAll('.work-card h3')).some((title) => title.textContent === testTitle), 'obra da coleção')

                // Bulk em rota filtrada remove imediatamente IDs que deixam o resultado.
                window.location.hash = '/library/status/reading'
                await waitFor(() => document.querySelector('.library-page h1')?.textContent === 'Biblioteca', 'rota Lendo montada')
                await waitFor(() => document.querySelector('button[aria-label="Abrir ' + testTitle + '"]'), 'obra na rota Lendo')
                byText(document.querySelector('.page-header__actions'), 'Selecionar').click()
                await waitFor(() => document.querySelector('.bulk-toolbar'), 'modo de seleção')
                ;(await waitFor(() => Array.from(document.querySelectorAll('.work-card')).find((card) => card.querySelector('h3')?.textContent === testTitle), 'card selecionável')).click()
                await waitFor(() => document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'primeira seleção aplicada')
                let bulkMenu = document.querySelector('.bulk-overflow')
                bulkMenu.querySelector('summary').click()
                await waitFor(() => bulkMenu.open, 'menu bulk aberto')
                bulkMenu.querySelector('summary').focus()
                bulkMenu.querySelector('summary').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
                await waitFor(() => document.activeElement?.textContent.trim() === 'Favoritar', 'seta no menu bulk')
                document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                if (bulkMenu.open || !document.querySelector('.bulk-toolbar')) throw new Error('Esc não fechou primeiro o menu bulk.')
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                await waitFor(() => !document.querySelector('.bulk-toolbar'), 'segundo Esc sai da seleção')
                byText(document.querySelector('.page-header__actions'), 'Selecionar').click()
                await waitFor(() => document.querySelector('.bulk-toolbar'), 'novo modo de seleção')
                ;(await waitFor(() => Array.from(document.querySelectorAll('.work-card')).find((card) => card.querySelector('h3')?.textContent === testTitle), 'novo card selecionável')).click()
                await waitFor(() => document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'segunda seleção aplicada')
                byText(document.querySelector('.bulk-toolbar'), 'Status').click()
                modal = await waitFor(latestDialog, 'status em lote')
                await chooseSelect('Novo status', 'Esperando')
                byText(modal, 'Aplicar status').click()
                await waitFor(() => !document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'obra removida do filtro')
                await waitFor(() => document.querySelector('.bulk-toolbar strong')?.textContent.startsWith('0 '), 'seleção reconciliada')
                byText(document.querySelector('.bulk-toolbar'), 'Sair da seleção').click()
                window.location.hash = '/work/' + work.id
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === testTitle, 'obra após bulk')

                // F — capa customizada pelo seletor seguro injetado somente no smoke.
                byText(openWorkMenu(), 'Alterar capa').click()
                modal = await waitFor(latestDialog, 'alterar capa')
                byText(modal, 'Escolher arquivo').click()
                await waitFor(() => document.querySelector('.work-hero .work-cover img'), 'capa customizada')
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'retorno à Biblioteca')
                window.location.hash = '/work/' + work.id
                await waitFor(() => document.querySelector('.work-hero .work-cover img'), 'capa após reabrir')

                // Estado específico da rota quando a obra está na Lixeira.
                byText(openWorkMenu(), 'Mover para Lixeira').click()
                modal = await waitFor(latestDialog, 'confirmação da Lixeira')
                byText(modal, 'Mover').click()
                await waitFor(() => document.querySelector('.library-page'), 'navegação após Lixeira')
                window.location.hash = '/work/' + work.id
                await waitFor(() => document.querySelector('.trashed-work-state'), 'estado da obra na Lixeira')
                byText(document, 'Restaurar').click()
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === testTitle, 'obra restaurada')

                const persisted = await window.auri.works.getDetails({ workId: work.id })
                const checks = { progress: persisted.work.lastReadChapter?.label === '183', alias: persisted.aliases.some((item) => item.name === 'E2E Alternative'), tag: persisted.tags.some((item) => item.name === 'Murim E2E'), source: persisted.sources[0]?.isPreferred === true, collection: persisted.collections.some((item) => item.name === 'Murim favoritos E2E'), cover: persisted.work.cover.type === 'custom' }
                const domainReady = Object.values(checks).every(Boolean)
                if (!domainReady) throw new Error('E2E domain checks: ' + JSON.stringify(checks))
                // G — pesquisa, revisão e importação pela interface.
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'biblioteca para metadata')
                byText(document, 'Adicionar obra').click()
                modal = await waitFor(latestDialog, 'escolha de metadata')
                byText(modal, 'Buscar metadados').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-search)'), 'pesquisa de metadata')
                setInput(modal.querySelector('.metadata-search input'), 'Auri')
                ;(await waitFor(() => modal.querySelector('.metadata-results button'), 'resultado de metadata')).click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-review)'), 'revisão de metadata')
                byText(modal, 'Importar para o Auri').click()
                const imported = await waitFor(async () => (await window.auri.library.query({ search: 'Auri Metadata Test' }))[0] && await window.auri.works.getDetails({ workId: (await window.auri.library.query({ search: 'Auri Metadata Test' }))[0].id }), 'obra importada')
                const remoteCover = await window.auri.covers.get({ workId: imported.work.id })
                const cacheUsage = await window.auri.covers.usage()
                const metadataReady = imported.externalRefs[0]?.lastSyncedAt && remoteCover.state === 'ready' && remoteCover.dataUrl?.startsWith('data:image/webp') && cacheUsage.files >= 1
                if (!metadataReady) throw new Error('Metadata/cover E2E checks failed')
                // H — override de título e refresh manual com preview.
                window.location.hash = '/work/' + imported.work.id
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === 'Auri Metadata Test', 'obra importada aberta')
                byText(openWorkMenu(), 'Editar obra').click()
                modal = await waitFor(latestDialog, 'editar obra importada')
                const customCoverOption = Array.from(modal.querySelectorAll('.cover-options label')).find((label) => label.textContent.includes('Arquivo local'))
                customCoverOption.querySelector('input').click()
                byText(modal, 'Salvar alterações').click()
                await sleep(150)
                if (!modal.open || (await window.auri.works.get({ workId: imported.work.id })).cover.type !== 'remote') throw new Error('Cancelamento da capa encerrou o editor ou alterou a capa.')
                const remoteCoverOption = Array.from(modal.querySelectorAll('.cover-options label')).find((label) => label.textContent.trim() === 'URL')
                remoteCoverOption.querySelector('input').click()
                setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), 'Meu título importado')
                byText(modal, 'Salvar alterações').click()
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === 'Meu título importado', 'override de título')
                byText(openWorkMenu(), 'Atualizar metadados').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-refresh)'), 'preview do refresh')
                await waitFor(() => modal.querySelector('.metadata-refresh article.is-protected'), 'campo protegido no preview')
                byText(modal, 'Aplicar mudanças').click()
                await waitFor(() => !document.querySelector('dialog[open]:has(.metadata-refresh)'), 'refresh aplicado')
                if (document.querySelector('.work-page h1')?.textContent !== 'Meu título importado') throw new Error('Override title was overwritten')
                // I — limpeza e reconstrução do cache.
                await window.auri.covers.clearAll()
                if ((await window.auri.covers.usage()).files !== 0) throw new Error('Cover cache was not cleared')
                if ((await window.auri.covers.get({ workId: imported.work.id })).state !== 'ready') throw new Error('Cover cache was not rebuilt')
                // J — zero resultados orienta; provider offline não bloqueia o cadastro manual.
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'biblioteca offline')
                byText(document, 'Adicionar obra').click()
                modal = await waitFor(latestDialog, 'escolha offline')
                byText(modal, 'Buscar metadados').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-search)'), 'pesquisa offline')
                setInput(modal.querySelector('.metadata-search input'), 'sem resultado')
                await sleep(800)
                if (!modal.querySelector('.metadata-empty')) setInput(modal.querySelector('.metadata-search input'), 'sem resultado ')
                const emptyMetadata = await waitFor(() => modal.querySelector('.metadata-empty'), 'orientação sem resultados', 15000)
                if (!emptyMetadata.textContent.includes('título em inglês') || !emptyMetadata.textContent.includes('pesquisando o título na web')) throw new Error('Empty metadata guidance missing')
                byText(modal, 'Tentar outro título').click()
                setInput(modal.querySelector('.metadata-search input'), 'offline')
                await sleep(800)
                if (!modal.querySelector('.metadata-error')) setInput(modal.querySelector('.metadata-search input'), 'offline ')
                await waitFor(() => modal.querySelector('.metadata-error'), 'erro offline')
                byText(modal, 'Adicionar manualmente').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.work-form)'), 'formulário manual offline')
                setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), 'Offline Manual E2E')
                byText(modal, 'Adicionar obra').click()
                const offlineWork = await waitFor(async () => (await window.auri.library.query({ search: 'Offline Manual E2E' }))[0], 'cadastro manual offline')
                await waitFor(() => !document.querySelector('dialog[open]'), 'cadastro manual offline fechado')

                // Fluxo seguro de URL usa HTML determinístico e confirma a fonte antes do cadastro.
                byText(document, 'Adicionar obra').click()
                modal = await waitFor(latestDialog, 'escolha de cadastro por URL')
                byText(modal, 'Adicionar por URL').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.url-analyze-form)'), 'formulário de URL')
                setInput(modal.querySelector('input[type="url"]'), 'https://reader.e2e.example/original')
                byText(modal, 'Analisar URL').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.url-metadata-preview)'), 'preview de URL')
                if (!modal.querySelector('h3')?.textContent.includes('URL Smoke Work')) throw new Error('Metadata segura da URL não foi exibida.')
                byText(modal, 'Continuar com dados detectados').click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.work-form)'), 'cadastro manual vindo da URL')
                byText(modal, 'Adicionar obra').click()
                const urlWork = await waitFor(async () => (await window.auri.library.query({ search: 'URL Smoke Work' }))[0], 'obra cadastrada por URL')
                const urlDetails = await window.auri.works.getDetails({ workId: urlWork.id })
                if (urlDetails.sources[0]?.domain !== 'reader.e2e.example' || !urlDetails.sources[0]?.isPreferred) throw new Error('Fonte da URL não foi preservada no cadastro.')
                await waitFor(() => !document.querySelector('dialog[open]'), 'cadastro por URL fechado')

                // Busca rápida diferencia vazio de falha técnica e oferece retry.
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'biblioteca para busca rápida vazia')
                document.activeElement?.blur()
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.quick-search)'), 'busca rápida para estados')
                setInput(modal.querySelector('.quick-search input'), 'zzzz-local-none')
                await waitFor(() => modal.querySelector('.quick-search__state')?.textContent.includes('Nenhuma obra encontrada'), 'busca rápida vazia')
                setInput(modal.querySelector('.quick-search input'), 'E2E IPC ERROR')
                await waitFor(() => modal.querySelector('.quick-search__state[role="alert"]'), 'erro tratado da busca rápida')
                if (!byText(modal, 'Tentar novamente')) throw new Error('Retry ausente na busca rápida.')
                modal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
                await waitFor(() => !document.querySelector('dialog[open]'), 'busca rápida fechada')

                // Cancelamentos normais de backup/exportação não geram erro.
                window.location.hash = '/settings'
                await waitFor(() => document.querySelector('.settings-page'), 'Configurações para cancelamentos')
                byText(document, 'Backup e dados').click()
                await waitFor(() => byText(document, 'Exportar JSON'), 'ações de portabilidade')
                const errorsBeforeCancel = document.querySelectorAll('.toast--error').length
                byText(document, 'Exportar JSON').click()
                await sleep(120)
                byText(document, 'Escolher backup').click()
                await sleep(120)
                if (document.querySelectorAll('.toast--error').length !== errorsBeforeCancel || document.querySelector('dialog[open]')) throw new Error('Cancelamento de backup/export foi tratado como erro.')

                // Confirmações do Auri preservam foco, prendem Tab e impedem ação destrutiva duplicada.
                const backupsBeforeCreate = (await window.auri.backup.state()).backups.length
                byText(document, 'Criar backup').click()
                await waitFor(async () => (await window.auri.backup.state()).backups.length === backupsBeforeCreate + 1 && document.querySelector('.backup-list article .button--danger'), 'backup criado para modal')
                const deleteBackupButton = document.querySelector('.backup-list article .button--danger')
                deleteBackupButton.focus()
                deleteBackupButton.click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.dialog__filename)'), 'modal Auri de exclusão de backup')
                if (modal.getAttribute('role') !== 'dialog' || modal.getAttribute('aria-modal') !== 'true' || !modal.textContent.includes('Excluir backup?') || !modal.textContent.includes('será excluído permanentemente')) throw new Error('Modal destrutivo de backup incompleto.')
                await sleep(80)
                const cancelBackupDelete = byText(modal, 'Cancelar')
                let confirmBackupDelete = byText(modal, 'Excluir backup')
                if (document.activeElement !== cancelBackupDelete) throw new Error('Foco destrutivo inicial não ficou em Cancelar.')
                confirmBackupDelete.focus()
                confirmBackupDelete.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
                if (document.activeElement !== cancelBackupDelete) throw new Error('Tab escapou do modal de backup.')
                modal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
                await waitFor(() => !document.querySelector('dialog[open]'), 'cancelamento por Escape do backup')
                await sleep(40)
                if (document.activeElement !== deleteBackupButton) throw new Error('Foco não retornou ao botão que abriu o modal.')
                deleteBackupButton.click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.dialog__filename)'), 'reabertura do modal de backup')
                confirmBackupDelete = byText(modal, 'Excluir backup')
                const backupsBeforeDelete = (await window.auri.backup.state()).backups.length
                confirmBackupDelete.click()
                confirmBackupDelete.click()
                await waitFor(async () => !document.querySelector('dialog[open]') && (await window.auri.backup.state()).backups.length === backupsBeforeDelete - 1, 'exclusão única do backup')

                // Home — ocultação independente, menu sem click-through, fila única e callbacks corretos de Desfazer.
                while (document.querySelector('.toast__close')) { document.querySelector('.toast__close').click(); await sleep(40) }
                const homeTargets = await Promise.all([imported.work.id, offlineWork.id, urlWork.id].map((workId) => window.auri.works.get({ workId })))
                for (const target of homeTargets) await window.auri.works.update({ id: target.id, userStatus: 'waiting', hiddenFromHome: false })
                window.dispatchEvent(new Event('auri:data-changed'))
                window.location.hash = '/'
                await waitFor(() => document.querySelector('.home-section'), 'Home para ocultação')
                const findHomeCard = (title) => Array.from(document.querySelectorAll('.home-work-card')).find((card) => card.querySelector('h3')?.textContent === title)
                const hideCard = async (target, testKeyboard = false) => {
                  const card = await waitFor(() => findHomeCard(target.title), 'card da Home ' + target.title)
                  const menu = card.querySelector('details[data-keyboard-menu]')
                  const summary = menu.querySelector('summary')
                  const hashBefore = window.location.hash
                  summary.focus(); summary.click()
                  if (!menu.open || window.location.hash !== hashBefore) throw new Error('Menu da Home abriu a obra ou não abriu no primeiro clique.')
                  if (testKeyboard) {
                    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
                    if (menu.open || document.activeElement !== summary) throw new Error('Escape/foco do menu da Home falhou.')
                    summary.click()
                  }
                  byText(menu, 'Ocultar da Home').click()
                  await waitFor(async () => (await window.auri.works.get({ workId: target.id })).hiddenFromHome && !findHomeCard(target.title), 'ocultar ' + target.title)
                  if (window.location.hash !== hashBefore) throw new Error('Ocultar da Home causou click-through.')
                }
                await hideCard(homeTargets[0], true)
                await hideCard(homeTargets[1])
                await hideCard(homeTargets[2])
                if (document.querySelectorAll('.toast').length !== 2) throw new Error('Toaster não respeitou os dois slots visíveis.')
                let activeToast = await waitFor(() => document.querySelector('.toast:has(.toast__action)'), 'toast com Desfazer')
                activeToast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
                await sleep(9300)
                if (!document.body.contains(activeToast)) throw new Error('Hover não pausou o timeout do toast com ação.')
                activeToast.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
                byText(activeToast, 'Desfazer').click()
                await waitFor(async () => !(await window.auri.works.get({ workId: homeTargets[0].id })).hiddenFromHome, 'Desfazer da primeira obra')
                await sleep(120)
                activeToast = await waitFor(() => document.querySelector('.toast:has(.toast__action)'), 'toast promovido da terceira obra')
                byText(activeToast, 'Desfazer').click()
                await waitFor(async () => !(await window.auri.works.get({ workId: homeTargets[2].id })).hiddenFromHome, 'Desfazer da terceira obra')
                if (!(await window.auri.works.get({ workId: homeTargets[1].id })).hiddenFromHome) throw new Error('Callback de Desfazer restaurou a obra errada.')

                // Configurações oferece um gerenciador enxuto para restaurar obras ocultas.
                window.location.hash = '/settings'
                await waitFor(() => document.querySelector('.settings-page'), 'Configurações para obras ocultas')
                document.querySelector('[data-settings-section="library"]').click()
                const hiddenManagerButton = await waitFor(() => byText(document.querySelector('.settings-panel'), 'Gerenciar'), 'gerenciador de obras ocultas')
                hiddenManagerButton.click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.hidden-home-list)'), 'dialog de obras ocultas')
                if (!modal.textContent.includes(homeTargets[1].title)) throw new Error('Obra ocultada não apareceu no gerenciador.')
                byText(modal, 'Mostrar na Home').click()
                await waitFor(async () => !(await window.auri.works.get({ workId: homeTargets[1].id })).hiddenFromHome, 'restauração em Configurações')
                await window.auri.works.deletePermanently({ workId: imported.work.id })
                await window.auri.works.deletePermanently({ workId: offlineWork.id })
                await window.auri.works.deletePermanently({ workId: urlWork.id })
                await window.auri.works.deletePermanently({ workId: quickWork.id })
                await window.auri.works.deletePermanently({ workId: work.id })
                return { schemaVersion: status.database.schemaVersion, domainReady: domainReady && !!metadataReady }
              })()
            `))
            .then((result: { schemaVersion: number; domainReady: boolean }) => {
              console.log(
                `AURI_SMOKE_TEST_OK schema=${result.schemaVersion} domain=${result.domainReady}`
              )
              app.quit()
            })
            .catch((error: unknown) => {
              console.error('AURI_SMOKE_TEST_FAILED', error instanceof Error ? error.stack : error)
              app.exit(1)
            })
        })

        mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
          console.error(`AURI_SMOKE_TEST_FAILED load=${code} ${description}`)
          app.exit(1)
        })
      }

      if (isSettingsScrollTest) {
        mainWindow.setSize(1440, 900)
        mainWindow.webContents.once('did-finish-load', () => {
          const output = join(process.cwd(), 'artifacts', 'settings-scroll')
          mkdirSync(output, { recursive: true })
          void mainWindow.webContents
            .executeJavaScript(`
              window.location.hash = '/settings'
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .settings-heading')
                  ? resolve(true)
                  : Date.now() - started > 5000 ? reject(new Error('Configurações não abriu.')) : setTimeout(check, 50)
                check()
              })
            `)
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const backup = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Backup e dados')
                backup?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .backup-list')
                  ? resolve(true)
                  : Date.now() - started > 5000 ? reject(new Error('Backup não abriu.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const page = document.querySelector('.settings-page')
                const header = page?.querySelector('.page-header')
                const nav = page?.querySelector('.settings-layout > nav')
                const panel = page?.querySelector('.settings-panel')
                if (!page || !header || !nav || !panel) return reject(new Error('Estrutura de Configurações incompleta.'))
                if (getComputedStyle(page).overflowY !== 'hidden' || getComputedStyle(panel).overflowY !== 'auto') return reject(new Error('Overflow não está isolado no painel.'))
                if (panel.scrollHeight <= panel.clientHeight) return reject(new Error('Backup não possui conteúdo rolável para o smoke.'))
                const before = { header: header.getBoundingClientRect().top, nav: nav.getBoundingClientRect().top }
                panel.scrollTop = panel.scrollHeight
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const after = { header: header.getBoundingClientRect().top, nav: nav.getBoundingClientRect().top }
                  if (panel.scrollTop <= 0 || page.scrollTop !== 0 || before.header !== after.header || before.nav !== after.nav) reject(new Error('Cabeçalho ou menu se moveu durante a rolagem de Backup.'))
                  else resolve(true)
                }))
              })
            `))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-backup-1440x900-bottom.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const appearance = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Aparência')
                appearance?.click()
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const panel = document.querySelector('.settings-panel')
                  if (panel?.querySelector('h2')?.textContent === 'Aparência' && panel.scrollTop === 0) resolve(true)
                  else reject(new Error('Aparência não voltou ao topo após Backup.'))
                }))
              })
            `))
            .then(() => { mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const maintenance = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Manutenção')
                maintenance?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .storage-value')
                  ? resolve(true)
                  : Date.now() - started > 5000 ? reject(new Error('Manutenção não abriu.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const page = document.querySelector('.settings-page')
                const header = page?.querySelector('.page-header')
                const nav = page?.querySelector('.settings-layout > nav')
                const panel = page?.querySelector('.settings-panel')
                if (!page || !header || !nav || !panel) return reject(new Error('Estrutura compacta de Configurações incompleta.'))
                const scrollables = [page, ...page.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(element).overflowY))
                if (scrollables.length !== 1 || scrollables[0] !== panel) return reject(new Error('Configurações possui mais de uma área rolável: ' + scrollables.map((item) => item.className).join(', ')))
                if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) return reject(new Error('Overflow horizontal global em 1100x720.'))
                const before = { header: header.getBoundingClientRect().top, nav: nav.getBoundingClientRect().top }
                panel.scrollTop = panel.scrollHeight
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const after = { header: header.getBoundingClientRect().top, nav: nav.getBoundingClientRect().top }
                  if (panel.scrollTop <= 0 || page.scrollTop !== 0 || before.header !== after.header || before.nav !== after.nav) reject(new Error('Cabeçalho ou menu se moveu durante a rolagem de Manutenção.'))
                  else resolve(true)
                }))
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-maintenance-1100x720-bottom.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const appearance = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Aparência')
                appearance?.click()
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const panel = document.querySelector('.settings-panel')
                  if (panel?.querySelector('h2')?.textContent === 'Aparência' && panel.scrollTop === 0) resolve(true)
                  else reject(new Error('Aparência não voltou ao topo após Manutenção.'))
                }))
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 300)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-appearance-1100x720-top.png'), image.toPNG()))
            .then(() => {
              console.log('AURI_SETTINGS_SCROLL_TEST_OK resolutions=1440x900,1100x720')
              app.quit()
            })
            .catch((error: unknown) => {
              console.error('AURI_SETTINGS_SCROLL_TEST_FAILED', error)
              app.exit(1)
            })
        })
      }

      if (isScreenshotTest) {
        mainWindow.setSize(1440, 900)
        mainWindow.webContents.once('did-finish-load', () => {
          const output = join(process.cwd(), 'artifacts')
          mkdirSync(output, { recursive: true })
          let focusProbe: BrowserWindow | null = null
          void mainWindow.webContents
            .executeJavaScript(`
                new Promise((resolve, reject) => {
                  const started = Date.now()
                  const check = () => {
                    if (document.querySelector('.home-section, .empty-state, .error-state')) {
                      resolve(true)
                    } else if (Date.now() - started > 5000) {
                      reject(new Error('Home não terminou de renderizar.'))
                    } else {
                      setTimeout(check, 50)
                    }
                  }
                  check()
                })
            `)
            .then(() => new Promise((resolve) => setTimeout(resolve, 500)))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-home.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const menu = document.querySelector('.home-work-menu')
                const summary = menu?.querySelector('summary')
                summary?.click()
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const panel = menu?.querySelector('[role="menu"]')
                  const panelBounds = panel?.getBoundingClientRect()
                  const summaryBounds = summary?.getBoundingClientRect()
                  if (!menu?.open || !panel || !panelBounds || !summaryBounds) return reject(new Error('Menu da Home não abriu para o smoke visual.'))
                  if (getComputedStyle(panel).position !== 'absolute' || panelBounds.bottom > summaryBounds.top - 4 || panelBounds.height > 100) return reject(new Error('Menu da Home entrou no fluxo ou ficou esticado.'))
                  resolve(true)
                }))
              })
            `))
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-home-menu.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`document.querySelector('.home-work-menu')?.removeAttribute('open')`))
            .then(() => captureNativeWindow(mainWindow, join(output, 'auri-titlebar-native-restored.png')))
            .then(async () => {
              focusProbe = new BrowserWindow({ width: 80, height: 80, show: false, frame: false, skipTaskbar: true })
              await focusProbe.loadURL('data:text/html,<title>Focus probe</title>')
              focusProbe.show()
              focusProbe.focus()
              await new Promise((resolve) => setTimeout(resolve, 250))
            })
            .then(() => mainWindow.webContents.executeJavaScript(`
              document.querySelector('.window-titlebar.is-inactive') ? true : Promise.reject(new Error('Estado inativo da title bar não foi aplicado.'))
            `))
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-window-inactive.png'), image.toPNG()))
            .then(() => captureNativeWindow(mainWindow, join(output, 'auri-titlebar-native-inactive.png')))
            .then(() => { focusProbe?.close(); focusProbe = null; mainWindow.focus(); mainWindow.maximize(); return new Promise((resolve) => setTimeout(resolve, 300)) })
            .then(() => mainWindow.webContents.executeJavaScript(`
              (() => {
                const frame = document.querySelector('.window-frame')
                const titlebar = document.querySelector('.window-titlebar')
                const bounds = titlebar?.getBoundingClientRect()
                if (!frame || !titlebar || !bounds || Math.abs(bounds.width - innerWidth) > 1) throw new Error('Title bar não atravessa toda a janela maximizada.')
                if (getComputedStyle(frame, '::after').content !== 'none') throw new Error('Divisor antigo ainda está duplicado no frame.')
                if (getComputedStyle(titlebar).boxShadow === 'none') throw new Error('Divisor integrado da title bar não foi aplicado.')
                return true
              })()
            `))
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-window-maximized.png'), image.toPNG()))
            .then(() => captureNativeWindow(mainWindow, join(output, 'auri-titlebar-native-maximized.png')))
            .then(() => { mainWindow.unmaximize(); return new Promise((resolve) => setTimeout(resolve, 300)) })
            .then(() =>
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '/library'
                new Promise((resolve, reject) => {
                  const started = Date.now()
                  let viewRequested = false
                  const check = () => {
                    const gridButton = document.querySelector('button[aria-label="Visualização em grade"]')
                    if (gridButton && !gridButton.classList.contains('is-active') && !viewRequested) {
                      viewRequested = true
                      gridButton.click()
                    }
                    if ((gridButton?.classList.contains('is-active') && document.querySelector('.library-page .work-card') && !document.querySelector('.library-page .loading-state')) || document.querySelector('.library-page .empty-state, .library-page .error-state')) {
                      resolve(true)
                    } else if (Date.now() - started > 5000) {
                      reject(new Error('Biblioteca não terminou de renderizar.'))
                    } else {
                      setTimeout(check, 50)
                    }
                  }
                  check()
                })
              `)
            )
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.library-page .work-card') && !document.querySelector('.library-page .loading-state')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Grade da Biblioteca não estabilizou.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-library.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.auri.library.query({ search: 'Nano Machine' }).then((works) => {
                window.location.hash = '/work/' + works[0].id
                return new Promise((resolve, reject) => {
                  const started = Date.now()
                  const check = () => {
                    if (document.querySelector('.work-page .progress-stage') && !document.querySelector('.work-skeleton')) resolve(true)
                    else if (Date.now() - started > 5000) reject(new Error('Página da obra não terminou de renderizar.'))
                    else setTimeout(check, 50)
                  }
                  check()
                })
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 700)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-work.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.location.hash = '/library'
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => {
                  const add = document.querySelector('.library-page') && Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Adicionar obra'))
                  if (add) {
                    add.click()
                    setTimeout(() => {
                      const search = Array.from(document.querySelectorAll('dialog[open] button')).find((button) => button.textContent.includes('Buscar metadados'))
                      search?.click()
                      setTimeout(() => {
                        const input = document.querySelector('.metadata-search input')
                        if (!input) return reject(new Error('Pesquisa de metadados não abriu.'))
                        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
                        setter.call(input, 'Nano Machine')
                        input.dispatchEvent(new Event('input', { bubbles: true }))
                        const waitResults = () => document.querySelector('.metadata-results button') ? resolve(true) : Date.now() - started > 5000 ? reject(new Error('Resultados de metadata não apareceram.')) : setTimeout(waitResults, 50)
                        waitResults()
                      }, 100)
                    }, 100)
                  } else if (Date.now() - started > 5000) reject(new Error('Biblioteca não reabriu.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-add-search.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const manual = Array.from(document.querySelectorAll('dialog[open] button')).find((button) => button.textContent.includes('Adicionar manualmente'))
                manual?.click()
                setTimeout(() => document.querySelector('.work-form') ? resolve(true) : reject(new Error('Formulário manual não abriu.')), 150)
              })
            `))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => {
              writeFileSync(join(output, 'auri-add-manual.png'), image.toPNG())
            })
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now()
                document.querySelector('dialog[open]')?.close()
                const check = () => {
                  const discard = Array.from(document.querySelectorAll('dialog[open] button')).find((button) => button.textContent.includes('Descartar'))
                  discard?.click()
                  if (!document.querySelector('dialog[open]')) {
                    window.location.hash = '/settings'
                    resolve(true)
                  } else if (Date.now() - started > 5000) reject(new Error('Formulário manual não fechou.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .settings-heading')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Configurações não terminou de renderizar.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-appearance.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const backup = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Backup e dados')
                backup?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .backup-list')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Configuração de backup não terminou de renderizar.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-backup.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const create = Array.from(document.querySelectorAll('.settings-panel button')).find((button) => button.textContent.trim() === 'Criar backup')
                create?.click()
                const started = Date.now()
                const check = () => {
                  const remove = document.querySelector('.backup-list article .button--danger:not(:disabled)')
                  if (remove) { remove.click(); resolve(true) }
                  else if (Date.now() - started > 5000) reject(new Error('Modal visual de exclusão de backup não abriu.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => {
                  const dialog = document.querySelector('dialog[open]:has(.dialog__filename)')
                  if (dialog) {
                    const filename = dialog.querySelector('.dialog__filename')
                    if (!filename?.getAttribute('title') || !dialog.querySelector('.button--danger')) reject(new Error('Modal destrutivo sem nome completo ou CTA claro.'))
                    else resolve(true)
                  } else if (Date.now() - started > 5000) reject(new Error('Confirmação destrutiva não renderizou.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 300)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-dialog-delete-backup.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const dialog = document.querySelector('dialog[open]:has(.dialog__filename)')
                const confirm = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent.trim() === 'Excluir backup')
                confirm?.click()
                const started = Date.now()
                const check = () => !document.querySelector('dialog[open]') ? resolve(true) : Date.now() - started > 5000 ? reject(new Error('Modal de exclusão não fechou após concluir.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const updates = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Atualizações')
                updates?.click()
                const started = Date.now()
                const check = () => {
                  const card = document.querySelector('.settings-panel .update-card')
                  const notes = document.querySelector('.release-notes__content')
                  if (card && notes) {
                      if (notes.textContent.includes('<h1>') || window.__auriUnsafeReleaseNote) return reject(new Error('HTML remoto inseguro foi executado ou exibido cru.'))
                      if (notes.querySelector('script, iframe, style, object, embed')) return reject(new Error('Elemento remoto inseguro permaneceu no Renderer.'))
                      if (!notes.querySelector('h1, h2') || !notes.querySelector('ul li') || !notes.querySelector('strong') || !notes.querySelector('a[href^="https://"]')) return reject(new Error('Estrutura das release notes ficou incompleta.'))
                      if (notes.scrollHeight <= notes.clientHeight) return reject(new Error('Release notes extensas não ativaram o scroll interno.'))
                      return resolve(true)
                  }
                  if (Date.now() - started > 5000) return reject(new Error('Configuração de atualizações não terminou de renderizar.'))
                  setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.executeJavaScript(`
              (() => {
                const notes = document.querySelector('.release-notes__content')
                if (!notes || !notes.textContent.includes('Janela integrada ao Auri')) throw new Error('Release notes não permaneceram estáveis antes da captura.')
                return true
              })()
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 250)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-updates.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const maintenance = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Manutenção')
                maintenance?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .storage-value')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Manutenção não terminou de renderizar.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const verify = Array.from(document.querySelectorAll('.settings-panel button')).find((button) => button.textContent.trim() === 'Verificar integridade')
                verify?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .integrity-result')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Verificação de integridade não terminou.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1438, 898); mainWindow.setSize(1440, 900); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-maintenance.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              const panel = document.querySelector('.settings-panel')
              if (panel) panel.scrollTop = panel.scrollHeight
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-settings-maintenance-bottom.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.location.hash = '/library'
              new Promise((resolve, reject) => {
                const started = Date.now()
                let viewRequested = false
                const check = () => {
                  const listButton = document.querySelector('button[aria-label="Visualização em lista"]')
                  if (listButton && !listButton.classList.contains('is-active') && !viewRequested) {
                    viewRequested = true
                    listButton.click()
                  }
                  if (listButton?.classList.contains('is-active') && document.querySelector('.library-page .work-list-row')) resolve(true)
                  else if (Date.now() - started > 5000) reject(new Error('Biblioteca em lista não terminou de renderizar.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => {
              writeFileSync(join(output, 'auri-library-list-compact.png'), image.toPNG())
              return mainWindow.webContents.executeJavaScript(`document.querySelector('button[aria-label="Visualização em grade"]')?.click()`)
            })
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.library-page .work-card')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Grade compacta não terminou de renderizar.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.executeJavaScript(`
              (() => {
                const root = document.documentElement
                if (root.scrollWidth > root.clientWidth + 1) throw new Error('Overflow horizontal global na Biblioteca compacta.')
                return true
              })()
            `))
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-library-grid-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const button = Array.from(document.querySelectorAll('.library-toolbar button')).find((item) => item.textContent.trim() === 'Filtros')
                button?.click()
                const started = Date.now()
                const check = () => {
                  const panel = document.querySelector('.filter-popover')
                  if (panel) {
                    const bounds = panel.getBoundingClientRect()
                    const content = document.querySelector('.app-content').getBoundingClientRect()
                    if (bounds.left < content.left - 1 || bounds.right > innerWidth + 1 || bounds.bottom > innerHeight + 1) reject(new Error('Painel de filtros saiu da área útil: ' + JSON.stringify({ left: bounds.left, right: bounds.right, bottom: bounds.bottom, contentLeft: content.left, width: innerWidth, height: innerHeight })))
                    else resolve(true)
                  } else if (Date.now() - started > 5000) reject(new Error('Painel de filtros não abriu.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-library-filters-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              document.querySelector('.filter-popover__header > button')?.click()
              window.location.hash = '/'
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.home-section')
                  ? document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 ? resolve(true) : reject(new Error('Overflow horizontal global na Home compacta.'))
                  : Date.now() - started > 5000 ? reject(new Error('Home compacta não terminou de renderizar.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-home-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.location.hash = '/collections'
              new Promise((resolve, reject) => {
                const started = Date.now()
                const check = () => document.querySelector('.collection-row')
                  ? resolve(true)
                  : Date.now() - started > 5000 ? reject(new Error('Coleções não terminou de renderizar.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-collections-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.location.hash = '/library'
              new Promise((resolve, reject) => {
                const started = Date.now()
                const byText = (text) => Array.from(document.querySelectorAll('.library-page button')).find((button) => button.textContent.trim() === text)
                const check = () => {
                  const select = byText('Selecionar')
                  if (select) {
                    select.click()
                    setTimeout(() => {
                      document.querySelector('.work-card__open')?.click()
                      setTimeout(() => document.querySelector('.bulk-toolbar')?.textContent.includes('1 selecionada') ? resolve(true) : reject(new Error('Seleção múltipla não estabilizou.')), 100)
                    }, 100)
                  } else if (Date.now() - started > 5000) reject(new Error('Biblioteca não reabriu para seleção.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-bulk-actions-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const exit = Array.from(document.querySelectorAll('.bulk-toolbar button')).find((button) => button.textContent.trim() === 'Sair da seleção')
                exit?.click()
                const collapse = document.querySelector('button[aria-label="Recolher sidebar"]')
                collapse?.click()
                const started = Date.now()
                const check = () => {
                  const library = document.querySelector('.sidebar--compact button[aria-label^="Biblioteca"]')
                  if (library) {
                    library.focus()
                    library.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
                    library.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
                    const tooltipStarted = Date.now()
                    const waitTooltip = () => document.querySelector('.sidebar-tooltip')
                      ? resolve(true)
                      : Date.now() - tooltipStarted > 2000 ? reject(new Error('Tooltip da sidebar compacta não apareceu.')) : setTimeout(waitTooltip, 50)
                    waitTooltip()
                  } else if (Date.now() - started > 5000) reject(new Error('Sidebar não compactou.'))
                  else setTimeout(check, 50)
                }
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-sidebar-tooltip-compact.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise(async (resolve, reject) => {
                document.querySelector('button[aria-label="Expandir sidebar"]')?.click()
                const works = await window.auri.library.query({ search: 'Eleceed' })
                if (!works[0]) return reject(new Error('Obra para a Lixeira não encontrada.'))
                await window.auri.works.trash({ workId: works[0].id })
                window.location.hash = '/trash'
                const started = Date.now()
                const check = () => document.querySelector('.trash-item .button--danger-ghost')
                  ? resolve(true)
                  : Date.now() - started > 5000 ? reject(new Error('Lixeira não terminou de renderizar.')) : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.setSize(1098, 718); mainWindow.setSize(1100, 720); mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'auri-trash-compact.png'), image.toPNG()))
            .then(() => {
              console.log('AURI_SCREENSHOT_TEST_OK')
              app.quit()
            })
            .catch((error: unknown) => {
              console.error('AURI_SCREENSHOT_TEST_FAILED', error)
              app.exit(1)
            })
        })
      }
    } catch (error) {
      await showStartupRecovery(error)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && context) createMainWindow()
    })
  })
}

app.on('before-quit', () => {
  unregisterIpc?.()
  context?.dispose()
  unregisterIpc = undefined
  context = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

async function runReleasePersistenceSmoke(appContext: AppContext): Promise<void> {
  const markerPath = join(app.getPath('userData'), 'release-persistence-smoke.json')
  if (!existsSync(markerPath)) {
    const collection = appContext.services.details.createCollection({ name: 'Coleção persistente', description: 'Validação da v1.' })
    const details = appContext.services.details.createDetailed({
      title: 'Obra persistente da v1', mediaType: 'webtoon', userStatus: 'reading', chapter: '42', favorite: true,
      notes: 'Metadados manuais preservados.', lastReadNote: 'Onde parei na validação.',
      aliases: [{ name: 'Alias persistente', kind: 'alternative', source: 'user' }],
      creators: [{ name: 'Autora persistente', role: 'author', source: 'user' }],
      genres: ['Fantasia'], tags: ['Validação'], collectionIds: [collection.id],
      source: { name: 'Fonte persistente', seriesUrl: 'https://example.com/obra-persistente', language: 'pt-BR', isPreferred: true }
    })
    appContext.services.progress.incrementProgress({ workId: details.work.id })
    appContext.services.settings.updateSettings({ libraryView: 'list', librarySort: 'title_asc', cardSize: 'large', sidebarCompact: true, backupAutomatic: false })
    writeFileSync(markerPath, JSON.stringify({ workId: details.work.id }), 'utf8')
    console.log('AURI_RELEASE_PERSISTENCE_TEST_SEEDED')
    app.quit()
    return
  }

  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { workId?: string }
  assertRelease(typeof marker.workId === 'string', 'Marcador de persistência inválido.')
  const details = appContext.services.details.getDetails({ workId: marker.workId })
  const settings = appContext.services.settings.getSettings()
  const summary = appContext.services.library.getSummary()
  const home = appContext.services.library.getHome()
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

async function runReleaseBackupRestoreSmoke(appContext: AppContext): Promise<void> {
  const markerPath = join(app.getPath('userData'), 'release-backup-restore-smoke.json')
  if (!existsSync(markerPath)) {
    const details = appContext.services.details.createDetailed({
      title: 'Estado original do backup', mediaType: 'manhwa', userStatus: 'waiting', chapter: '18', favorite: true,
      aliases: [{ name: 'Original preservado', source: 'user' }],
      source: { name: 'Fonte do backup', seriesUrl: 'https://example.com/backup-original', isPreferred: true }
    })
    appContext.services.settings.updateSettings({ libraryView: 'list', cardSize: 'large', sidebarCompact: true, backupAutomatic: false })
    const backup = await appContext.services.backups.createBackup('manual')
    writeFileSync(markerPath, JSON.stringify({ workId: details.work.id, backupPath: backup.path }), 'utf8')
    appContext.services.works.updateWork({ id: details.work.id, title: 'Estado alterado depois do backup', favorite: false, userStatus: 'dropped' })
    appContext.services.works.createWork({ title: 'Obra criada depois do backup', mediaType: 'other', userStatus: 'want_to_read' })
    appContext.services.settings.updateSettings({ libraryView: 'grid', cardSize: 'small', sidebarCompact: false })
    await appContext.services.backups.restoreBackup(backup.path)
    return
  }

  const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { workId?: string; backupPath?: string }
  assertRelease(typeof marker.workId === 'string' && typeof marker.backupPath === 'string', 'Marcador de restore inválido.')
  const works = appContext.services.library.queryWorks({})
  const details = appContext.services.details.getDetails({ workId: marker.workId })
  const settings = appContext.services.settings.getSettings()
  const backups = appContext.services.backups.getState().backups
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

async function runNativeWindowStateSmoke(window: BrowserWindow): Promise<void> {
  const originalBounds = window.getBounds()
  window.maximize()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assertRelease(window.isMaximized(), 'A janela não maximizou pelo controle nativo.')
  window.unmaximize()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assertRelease(!window.isMaximized(), 'A janela não restaurou após maximizar.')
  window.minimize()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assertRelease(window.isMinimized(), 'A janela não minimizou pelo controle nativo.')
  window.restore()
  await new Promise((resolve) => setTimeout(resolve, 120))
  assertRelease(!window.isMinimized(), 'A janela não restaurou após minimizar.')
  window.setBounds({ ...originalBounds, width: originalBounds.width + 20, height: originalBounds.height + 20 })
  await new Promise((resolve) => setTimeout(resolve, 120))
  const resized = window.getBounds()
  assertRelease(resized.width === originalBounds.width + 20 && resized.height === originalBounds.height + 20, 'A janela não respondeu ao redimensionamento.')
  window.setBounds(originalBounds)
}

async function showStartupRecovery(error: unknown): Promise<void> {
  const failure = classifyDatabaseOpenFailure(error)
  const paths = resolveDataPaths(app.getPath('userData'))
  const logger = new JsonLogger(join(paths.logs, CURRENT_LOG_FILE_NAME), !app.isPackaged)
  logger.error('database', 'Inicialização entrou no fluxo de recuperação.', { event: 'database.recovery_opened', errorCode: failure.kind })
  while (true) {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Não foi possível abrir sua biblioteca',
      message: failure.title,
      detail: `${failure.explanation}\n\nNenhum dado foi alterado automaticamente.`,
      buttons: ['Tentar novamente', 'Restaurar backup', 'Abrir pasta de dados', 'Ver detalhes', `Fechar ${APP_BRAND.name}`],
      defaultId: 0,
      cancelId: 4,
      noLink: true
    })
    if (result.response === 0) {
      app.relaunch()
      app.exit(0)
      return
    }
    if (result.response === 1) {
      const selected = await dialog.showOpenDialog({ title: `Restaurar backup do ${APP_BRAND.name}`, properties: ['openFile'], filters: [{ name: `Backup do ${APP_BRAND.name}`, extensions: ['auri-backup', 'lumi-backup'] }] })
      if (selected.canceled || !selected.filePaths[0]) continue
      const recovery = createRecoveryBackupService(app, logger)
      try {
        const preview = await recovery.backups.previewBackup(selected.filePaths[0])
        const confirmation = await dialog.showMessageBox({
          type: 'warning',
          title: 'Confirmar restauração',
          message: 'Restaurar esta biblioteca?',
          detail: `Backup de ${new Date(preview.createdAt).toLocaleString('pt-BR')}, com ${preview.workCount} obras. O arquivo atual será preservado separadamente para recuperação.`,
          buttons: ['Cancelar', 'Restaurar e reiniciar'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        })
        if (confirmation.response === 1) {
          await recovery.backups.restoreBackup(selected.filePaths[0])
          return
        }
      } catch (restoreError) {
        await dialog.showMessageBox({ type: 'error', title: 'Restauração não concluída', message: 'Não foi possível restaurar este backup com segurança.', detail: restoreError instanceof Error ? restoreError.message : 'Erro desconhecido.', buttons: ['Voltar'], noLink: true })
      } finally { recovery.dispose() }
      continue
    }
    if (result.response === 2) {
      const openError = await shell.openPath(paths.root)
      if (openError) await dialog.showMessageBox({ type: 'error', message: 'Não foi possível abrir a pasta de dados.', detail: openError, buttons: ['Voltar'] })
      continue
    }
    if (result.response === 3) {
      const detailResult = await dialog.showMessageBox({
        type: 'info',
        title: 'Detalhes técnicos',
        message: failure.title,
        detail: failure.technicalDetails,
        buttons: ['Copiar detalhes', 'Voltar'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (detailResult.response === 0) clipboard.writeText(`${APP_BRAND.name} ${app.getVersion()}\n${failure.technicalDetails}`)
      continue
    }
    app.quit()
    return
  }
}
