import { app, type BrowserWindow } from 'electron'

export function registerApplicationSmoke(mainWindow: BrowserWindow): void {
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


