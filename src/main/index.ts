import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
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

let context: AppContext | undefined
let unregisterIpc: (() => void) | undefined
const isSmokeTest = process.argv.includes('--smoke-test')
const isScreenshotTest = process.argv.includes('--screenshot-test')
const isBackupSmokeTest = process.argv.includes('--backup-smoke-test')
const testCoverBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const testMetadata: MetadataWork = { provider: 'anilist', externalId: '987654', title: 'Lumi Metadata Test', originalTitle: 'ルミテスト', aliases: [{ name: 'Lumi Test', kind: 'synonym' }], description: 'Metadados determinísticos para validar a integração completa.', mediaType: 'manga', publicationStatus: 'ongoing', countryCode: 'JP', startDate: '2026-08', endDate: null, creators: [{ name: 'Lumi Author', role: 'author' }], genres: ['Teste', 'Fantasia'], coverUrl: 'https://fixtures.lumi.invalid/cover.png', canonicalUrl: 'https://anilist.co/manga/987654' }
let testMetadataReads = 0
const testMetadataProvider: MetadataProvider = { id: 'anilist', search: async (query) => { const normalized = query.trim().toLowerCase(); if (normalized === 'offline') throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Fixture offline.'); if (normalized === 'sem resultado') return []; return [{ provider: testMetadata.provider, externalId: testMetadata.externalId, title: testMetadata.title, originalTitle: testMetadata.originalTitle, mediaType: testMetadata.mediaType, publicationStatus: testMetadata.publicationStatus, countryCode: testMetadata.countryCode, startDate: testMetadata.startDate, coverUrl: testMetadata.coverUrl, canonicalUrl: testMetadata.canonicalUrl }] }, getById: async (id) => { if (id !== testMetadata.externalId) return null; testMetadataReads += 1; return testMetadataReads > 1 ? { ...testMetadata, description: 'Descrição atualizada pela fixture de refresh.' } : testMetadata } }
const testCoverClient: CoverDownloadClient = { isOnline: () => true, download: async () => testCoverBytes }

app.setName('Lumi')
if (isBackupSmokeTest) app.disableHardwareAcceleration()
if (isSmokeTest || isScreenshotTest || isBackupSmokeTest) {
  app.setPath(
    'userData',
    join(app.getPath('temp'), isScreenshotTest ? 'lumi-screenshot-test' : isBackupSmokeTest ? 'lumi-backup-smoke-test' : 'lumi-smoke-test')
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
      context = await createAppContext(app, isSmokeTest || isScreenshotTest ? { metadataProviders: [testMetadataProvider], coverClient: testCoverClient } : {})
      if (isBackupSmokeTest) {
        const marker = `Packaged Backup ${Date.now()}`
        context.services.works.createWork({ title: marker, mediaType: 'other', userStatus: 'want_to_read' })
        const backup = await context.services.backups.createBackup('manual')
        const preview = await context.services.backups.previewBackup(backup.path)
        const exportPath = join(app.getPath('userData'), 'packaged-export.json')
        context.services.transfer.exportJson(exportPath)
        const importPreview = context.services.transfer.analyzeImport(exportPath)
        if (preview.workCount < 1 || importPreview.total < 1) throw new Error('Backup/export preview vazio.')
        console.log(`LUMI_BACKUP_SMOKE_TEST_OK backup=${backup.fileName} works=${preview.workCount}`)
        app.quit()
        return
      }
      const smokeCoverPath = isSmokeTest ? join(app.getPath('userData'), 'smoke-cover.png') : null
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
        smokeCoverPath ? { selectCoverFile: async () => smokeCoverPath } : undefined
      )
      void context.services.backups.runAutomaticIfDue().catch((error: unknown) => {
        context?.logger.error('backup', 'Falha no backup automático em segundo plano.', { event: 'backup.auto_failed', errorCode: error instanceof Error ? error.name : 'UNKNOWN' })
      })
      if (!isSmokeTest && !isScreenshotTest && !isBackupSmokeTest) {
        void context.services.updates.checkForUpdates().catch(() => { /* estado e logging são tratados pelo serviço */ })
      }
      if (isScreenshotTest) {
        for (const work of context.services.library.queryWorks({})) {
          context.services.works.deletePermanently({ workId: work.id })
        }
        for (const work of context.services.works.listTrash()) {
          context.services.works.deletePermanently({ workId: work.id })
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
        showWhenReady: !isSmokeTest && !isScreenshotTest,
        keepRenderingWhenHidden: isSmokeTest || isScreenshotTest
      })

      if (isSmokeTest) {
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents
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
                const testTitle = 'Lumi E2E Work'
                const status = await window.lumi.system.getStatus()
                for (const item of await window.lumi.library.query({ search: testTitle })) await window.lumi.works.deletePermanently({ workId: item.id })
                for (const cleanupTitle of ['Lumi Metadata Test', 'Meu título importado', 'Offline Manual E2E']) for (const item of await window.lumi.library.query({ search: cleanupTitle })) await window.lumi.works.deletePermanently({ workId: item.id })
                for (const item of await window.lumi.works.listTrash()) if (item.title === testTitle) await window.lumi.works.deletePermanently({ workId: item.id })
                window.location.hash = '/library'
                await waitFor(() => document.querySelector('.library-page'), 'Biblioteca inicial')

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
                const work = await waitFor(async () => (await window.lumi.library.query({ search: testTitle }))[0], 'obra criada')
                await waitFor(() => byText(document, 'Abrir obra'), 'ação Abrir obra')
                await waitFor(() => !document.querySelector('dialog[open]'), 'cadastro rápido fechado')
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
                setInput(modal.querySelector('input[placeholder="https://scan.example/obra"]'), 'https://scan.e2e.example/lumi')
                modal.querySelector('input[type="checkbox"]').click()
                byText(modal, 'Adicionar').click()
                await waitFor(() => document.querySelector('.source-row strong')?.textContent.includes('★'), 'fonte preferida')

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

                const persisted = await window.lumi.works.getDetails({ workId: work.id })
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
                setInput(modal.querySelector('.metadata-search input'), 'Lumi')
                ;(await waitFor(() => modal.querySelector('.metadata-results button'), 'resultado de metadata')).click()
                modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-review)'), 'revisão de metadata')
                byText(modal, 'Importar para o Lumi').click()
                const imported = await waitFor(async () => (await window.lumi.library.query({ search: 'Lumi Metadata Test' }))[0] && await window.lumi.works.getDetails({ workId: (await window.lumi.library.query({ search: 'Lumi Metadata Test' }))[0].id }), 'obra importada')
                const remoteCover = await window.lumi.covers.get({ workId: imported.work.id })
                const cacheUsage = await window.lumi.covers.usage()
                const metadataReady = imported.externalRefs[0]?.lastSyncedAt && remoteCover.state === 'ready' && remoteCover.dataUrl?.startsWith('data:image/webp') && cacheUsage.files >= 1
                if (!metadataReady) throw new Error('Metadata/cover E2E checks failed')
                // H — override de título e refresh manual com preview.
                window.location.hash = '/work/' + imported.work.id
                await waitFor(() => document.querySelector('.work-page h1')?.textContent === 'Lumi Metadata Test', 'obra importada aberta')
                byText(openWorkMenu(), 'Editar obra').click()
                modal = await waitFor(latestDialog, 'editar obra importada')
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
                await window.lumi.covers.clearAll()
                if ((await window.lumi.covers.usage()).files !== 0) throw new Error('Cover cache was not cleared')
                if ((await window.lumi.covers.get({ workId: imported.work.id })).state !== 'ready') throw new Error('Cover cache was not rebuilt')
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
                const offlineWork = await waitFor(async () => (await window.lumi.library.query({ search: 'Offline Manual E2E' }))[0], 'cadastro manual offline')
                await window.lumi.works.deletePermanently({ workId: imported.work.id })
                await window.lumi.works.deletePermanently({ workId: offlineWork.id })
                await window.lumi.works.deletePermanently({ workId: work.id })
                return { schemaVersion: status.database.schemaVersion, domainReady: domainReady && !!metadataReady }
              })()
            `)
            .then((result: { schemaVersion: number; domainReady: boolean }) => {
              console.log(
                `LUMI_SMOKE_TEST_OK schema=${result.schemaVersion} domain=${result.domainReady}`
              )
              app.quit()
            })
            .catch((error: unknown) => {
              console.error('LUMI_SMOKE_TEST_FAILED', error instanceof Error ? error.stack : error)
              app.exit(1)
            })
        })

        mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
          console.error(`LUMI_SMOKE_TEST_FAILED load=${code} ${description}`)
          app.exit(1)
        })
      }

      if (isScreenshotTest) {
        mainWindow.setSize(1440, 900)
        mainWindow.webContents.once('did-finish-load', () => {
          const output = join(process.cwd(), 'artifacts')
          mkdirSync(output, { recursive: true })
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
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'lumi-home.png'), image.toPNG()))
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
            .then((image) => writeFileSync(join(output, 'lumi-library.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              window.lumi.library.query({ search: 'Nano Machine' }).then((works) => {
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
            .then((image) => writeFileSync(join(output, 'lumi-work.png'), image.toPNG()))
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
            .then((image) => writeFileSync(join(output, 'lumi-add-search.png'), image.toPNG()))
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
              writeFileSync(join(output, 'lumi-add-manual.png'), image.toPNG())
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
            .then((image) => writeFileSync(join(output, 'lumi-settings-appearance.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const backup = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Backup')
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
            .then((image) => writeFileSync(join(output, 'lumi-settings-backup.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const updates = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Atualizações')
                updates?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .update-card')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Configuração de atualizações não terminou de renderizar.'))
                    : setTimeout(check, 50)
                check()
              })
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 500)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'lumi-settings-updates.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              new Promise((resolve, reject) => {
                const advanced = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Avançado')
                advanced?.click()
                const started = Date.now()
                const check = () => document.querySelector('.settings-panel .storage-value')
                  ? resolve(true)
                  : Date.now() - started > 5000
                    ? reject(new Error('Diagnóstico avançado não terminou de renderizar.'))
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
            .then((image) => writeFileSync(join(output, 'lumi-settings-advanced.png'), image.toPNG()))
            .then(() => mainWindow.webContents.executeJavaScript(`
              const page = document.querySelector('.settings-page')
              if (page) page.scrollTop = page.scrollHeight
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            `))
            .then(() => { mainWindow.webContents.invalidate(); return new Promise((resolve) => setTimeout(resolve, 400)) })
            .then(() => mainWindow.webContents.capturePage())
            .then((image) => writeFileSync(join(output, 'lumi-settings-maintenance.png'), image.toPNG()))
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
              writeFileSync(join(output, 'lumi-library-list-compact.png'), image.toPNG())
              return mainWindow.webContents.executeJavaScript(`window.lumi.settings.update({ libraryView: 'grid' })`)
            })
            .then(() => {
              console.log('LUMI_SCREENSHOT_TEST_OK')
              app.quit()
            })
            .catch((error: unknown) => {
              console.error('LUMI_SCREENSHOT_TEST_FAILED', error)
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

async function showStartupRecovery(error: unknown): Promise<void> {
  const failure = classifyDatabaseOpenFailure(error)
  const paths = resolveDataPaths(app.getPath('userData'))
  const logger = new JsonLogger(join(paths.logs, 'lumi.jsonl'), !app.isPackaged)
  logger.error('database', 'Inicialização entrou no fluxo de recuperação.', { event: 'database.recovery_opened', errorCode: failure.kind })
  while (true) {
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Não foi possível abrir sua biblioteca',
      message: failure.title,
      detail: `${failure.explanation}\n\nNenhum dado foi alterado automaticamente.`,
      buttons: ['Tentar novamente', 'Restaurar backup', 'Abrir pasta de dados', 'Ver detalhes', 'Fechar Lumi'],
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
      const selected = await dialog.showOpenDialog({ title: 'Restaurar backup do Lumi', properties: ['openFile'], filters: [{ name: 'Backup do Lumi', extensions: ['lumi-backup'] }] })
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
      if (detailResult.response === 0) clipboard.writeText(`Lumi ${app.getVersion()}\n${failure.technicalDetails}`)
      continue
    }
    app.quit()
    return
  }
}
