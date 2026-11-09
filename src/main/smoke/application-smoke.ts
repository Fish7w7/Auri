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
            (button) => button.getAttribute('aria-label') === text || button.textContent.trim() === text || Array.from(button.children).some((child) => child.textContent.trim() === text)
          )
          const latestDialog = () => Array.from(document.querySelectorAll('dialog[open]')).at(-1)
          const clickButton = (root, text) => {
            const button = root && byText(root, text)
            if (!button) throw new Error('Botão ausente no smoke: ' + text)
            button.click()
          }
          const openMenu = async (scope) => {
            const trigger = await waitFor(() => scope?.querySelector('button[aria-haspopup="menu"]'), 'botão do menu')
            trigger.click()
            return waitFor(() => document.getElementById(trigger.getAttribute('aria-controls')), 'menu aberto: ' + trigger.getAttribute('aria-label'))
          }
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
          modal.querySelector('button[data-add-work-mode="quick"]').click()
          await sleep(60)
          modal = latestDialog()
          setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), testTitle)
          setInput(modal.querySelector('input[placeholder="183, 10A ou Prólogo"]'), '183')
          clickButton(modal, 'Adicionar')
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
          clickButton(modal, 'Mover para a Lixeira')
          await waitFor(async () => !(await window.auri.library.query({ search: quickActionsTitle }))[0], 'remoção pela ação rápida')
          if (document.querySelector('.work-page')) throw new Error('Lixeira abriu a obra após a confirmação.')
  
          // Tamanhos de card mudam as colunas sem resetar a sidebar compacta.
          const cardColumns = {}
          for (const [value, label] of [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']]) {
            window.location.hash = '/settings'
            await waitFor(() => document.querySelector('.settings-page'), 'Configurações para tamanho ' + label)
            const sizeButton = await waitFor(() => Array.from(document.querySelectorAll('.card-size-options [role="radio"]')).find((button) => button.querySelector('strong')?.textContent === label), 'controle de tamanho ' + label)
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
          const openWorkMenu = () => openMenu(document.querySelector('.work-overflow'))
          clickButton(await openWorkMenu(), 'Editar obra')
          modal = await waitFor(latestDialog, 'edição da obra')
          setInput(modal.querySelector('textarea[placeholder="Sinopse ou contexto da obra…"]'), 'Descrição persistida pelo fluxo E2E.')
          clickButton(modal, 'Adicionar título')
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
          clickButton(document.querySelector('.no-source-callout'), 'Adicionar fonte')
          modal = await waitFor(latestDialog, 'adicionar fonte')
          setInput(modal.querySelector('input[placeholder="https://scan.example/obra"]'), 'https://scan.e2e.example/auri')
          modal.querySelector('input[type="checkbox"]').click()
          clickButton(modal, 'Adicionar')
          await waitFor(() => document.querySelector('.source-row strong')?.textContent.includes('★'), 'fonte preferida')
          clickButton(await openMenu(document.querySelector('.source-menu')), 'Editar')
          modal = await waitFor(latestDialog, 'editar fonte preferida')
          modal.querySelector('input[type="checkbox"]').click()
          clickButton(modal, 'Salvar')
          await waitFor(() => !document.querySelector('.source-row strong')?.textContent.includes('★'), 'preferência removida')
          clickButton(await openMenu(document.querySelector('.source-menu')), 'Editar')
          modal = await waitFor(latestDialog, 'redefinir fonte preferida')
          modal.querySelector('input[type="checkbox"]').click()
          clickButton(modal, 'Salvar')
          await waitFor(() => document.querySelector('.source-row strong')?.textContent.includes('★'), 'preferência redefinida')
  
          // D — edição de progresso, histórico e undo.
          clickButton(document.querySelector('.progress-controls'), 'Editar')
          modal = await waitFor(latestDialog, 'editar progresso')
          setInput(modal.querySelector('input[placeholder="191.5, 10A ou Prólogo"]'), '191')
          clickButton(modal, 'Salvar')
          await waitFor(() => document.querySelector('.progress-number')?.textContent === '191', 'progresso 191')
          ;(await waitFor(() => byText(document, 'Desfazer alteração'), 'undo do histórico')).click()
          await waitFor(() => document.querySelector('.progress-number')?.textContent === '183', 'progresso desfeito')
  
          // E — criar coleção e associar automaticamente.
          const collectionSection = Array.from(document.querySelectorAll('.work-section')).find((section) => section.querySelector('h2')?.textContent === 'Coleções')
          clickButton(collectionSection, '+ Gerenciar coleções')
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.collection-checklist)'), 'gerenciar coleções')
          clickButton(modal, 'Criar coleção')
          modal = await waitFor(() => latestDialog()?.querySelector('h2')?.textContent === 'Nova coleção' && latestDialog(), 'nova coleção')
          setInput(modal.querySelector('input'), 'Murim favoritos E2E')
          clickButton(modal, 'Criar')
          await waitFor(() => collectionSection.textContent.includes('Murim favoritos E2E'), 'coleção associada')
  
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
          clickButton(document.querySelector('.page-header__actions'), 'Selecionar')
          await waitFor(() => document.querySelector('.bulk-toolbar'), 'modo de seleção')
          ;(await waitFor(() => Array.from(document.querySelectorAll('.work-card')).find((card) => card.querySelector('h3')?.textContent === testTitle), 'card selecionável')).click()
          await waitFor(() => document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'primeira seleção aplicada')
          const bulkMenu = document.querySelector('.bulk-overflow')
          const bulkTrigger = bulkMenu.querySelector('button[aria-haspopup="menu"]')
          await openMenu(bulkMenu)
          bulkTrigger.focus()
          bulkTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
          await waitFor(() => document.activeElement?.textContent.trim() === 'Favoritar', 'seta no menu bulk')
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await waitFor(() => bulkTrigger.getAttribute('aria-expanded') === 'false', 'Esc fechou o menu bulk')
          if (!document.querySelector('.bulk-toolbar')) throw new Error('Esc também saiu da seleção.')
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await waitFor(() => !document.querySelector('.bulk-toolbar'), 'segundo Esc sai da seleção')
          clickButton(document.querySelector('.page-header__actions'), 'Selecionar')
          await waitFor(() => document.querySelector('.bulk-toolbar'), 'novo modo de seleção')
          ;(await waitFor(() => Array.from(document.querySelectorAll('.work-card')).find((card) => card.querySelector('h3')?.textContent === testTitle), 'novo card selecionável')).click()
          await waitFor(() => document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'segunda seleção aplicada')
          clickButton(document.querySelector('.bulk-toolbar'), 'Status')
          modal = await waitFor(latestDialog, 'status em lote')
          await chooseSelect('Novo status', 'Esperando')
          clickButton(modal, 'Aplicar status')
          await waitFor(() => !document.querySelector('button[aria-label="Desmarcar ' + testTitle + '"]'), 'obra removida do filtro')
          await waitFor(() => document.querySelector('.bulk-toolbar strong')?.textContent.startsWith('0 '), 'seleção reconciliada')
          clickButton(document.querySelector('.bulk-toolbar'), 'Sair da seleção')
          window.location.hash = '/work/' + work.id
          await waitFor(() => document.querySelector('.work-page h1')?.textContent === testTitle, 'obra após bulk')
  
          // F — capa customizada pelo seletor seguro injetado somente no smoke.
          clickButton(await openWorkMenu(), 'Alterar capa')
          modal = await waitFor(latestDialog, 'alterar capa')
          clickButton(modal, 'Escolher arquivo')
          await waitFor(() => document.querySelector('.work-hero .work-cover img'), 'capa customizada')
          window.location.hash = '/library'
          await waitFor(() => document.querySelector('.library-page'), 'retorno à Biblioteca')
          window.location.hash = '/work/' + work.id
          await waitFor(() => document.querySelector('.work-hero .work-cover img'), 'capa após reabrir')
  
          // Estado específico da rota quando a obra está na Lixeira.
          clickButton(await openWorkMenu(), 'Mover para Lixeira')
          modal = await waitFor(latestDialog, 'confirmação da Lixeira')
          clickButton(modal, 'Mover para a Lixeira')
          await waitFor(() => document.querySelector('.library-page'), 'navegação após Lixeira')
          window.location.hash = '/work/' + work.id
          await waitFor(() => document.querySelector('.trashed-work-state'), 'estado da obra na Lixeira')
          clickButton(document, 'Restaurar')
          await waitFor(() => document.querySelector('.work-page h1')?.textContent === testTitle, 'obra restaurada')
  
          const persisted = await window.auri.works.getDetails({ workId: work.id })
          const checks = { progress: persisted.work.lastReadChapter?.label === '183', alias: persisted.aliases.some((item) => item.name === 'E2E Alternative'), tag: persisted.tags.some((item) => item.name === 'Murim E2E'), source: persisted.sources[0]?.isPreferred === true, collection: persisted.collections.some((item) => item.name === 'Murim favoritos E2E'), cover: persisted.work.cover.type === 'custom' }
          const domainReady = Object.values(checks).every(Boolean)
          if (!domainReady) throw new Error('E2E domain checks: ' + JSON.stringify(checks))
          // G — pesquisa, revisão e importação pela interface.
          window.location.hash = '/library'
          await waitFor(() => document.querySelector('.library-page'), 'biblioteca para metadata')
          clickButton(document, 'Adicionar obra')
          modal = await waitFor(latestDialog, 'escolha de metadata')
          modal.querySelector('button[data-add-work-mode="search"]').click()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-search)'), 'pesquisa de metadata')
          setInput(modal.querySelector('.metadata-search input'), 'Auri')
          ;(await waitFor(() => modal.querySelector('.metadata-results button'), 'resultado de metadata')).click()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-review)'), 'revisão de metadata')
          clickButton(modal, 'Importar para o Auri')
          const imported = await waitFor(async () => (await window.auri.library.query({ search: 'Auri Metadata Test' }))[0] && await window.auri.works.getDetails({ workId: (await window.auri.library.query({ search: 'Auri Metadata Test' }))[0].id }), 'obra importada')
          const remoteCover = await window.auri.covers.get({ workId: imported.work.id })
          const cacheUsage = await window.auri.covers.usage()
          const metadataReady = imported.externalRefs[0]?.lastSyncedAt && remoteCover.state === 'ready' && remoteCover.dataUrl?.startsWith('data:image/webp') && cacheUsage.files >= 1
          if (!metadataReady) throw new Error('Metadata/cover E2E checks failed')
          // H — override de título e refresh manual com preview.
          window.location.hash = '/work/' + imported.work.id
          await waitFor(() => document.querySelector('.work-page h1')?.textContent === 'Auri Metadata Test', 'obra importada aberta')
          clickButton(await openWorkMenu(), 'Editar obra')
          modal = await waitFor(latestDialog, 'editar obra importada')
          const customCoverOption = Array.from(modal.querySelectorAll('.cover-options label')).find((label) => label.textContent.includes('Arquivo local'))
          customCoverOption.querySelector('input').click()
          clickButton(modal, 'Salvar alterações')
          await sleep(150)
          if (!modal.open || (await window.auri.works.get({ workId: imported.work.id })).cover.type !== 'remote') throw new Error('Cancelamento da capa encerrou o editor ou alterou a capa.')
          const remoteCoverOption = Array.from(modal.querySelectorAll('.cover-options label')).find((label) => label.textContent.trim() === 'URL')
          remoteCoverOption.querySelector('input').click()
          setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), 'Meu título importado')
          clickButton(modal, 'Salvar alterações')
          await waitFor(() => document.querySelector('.work-page h1')?.textContent === 'Meu título importado', 'override de título')
          clickButton(await openWorkMenu(), 'Atualizar metadados')
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-refresh)'), 'preview do refresh')
          await waitFor(() => modal.querySelector('.metadata-refresh article.is-protected'), 'campo protegido no preview')
          clickButton(modal, 'Aplicar mudanças')
          await waitFor(() => !document.querySelector('dialog[open]:has(.metadata-refresh)'), 'refresh aplicado')
          if (document.querySelector('.work-page h1')?.textContent !== 'Meu título importado') throw new Error('Override title was overwritten')
          // I — limpeza e reconstrução do cache.
          await window.auri.covers.clearAll()
          if ((await window.auri.covers.usage()).files !== 0) throw new Error('Cover cache was not cleared')
          if ((await window.auri.covers.get({ workId: imported.work.id })).state !== 'ready') throw new Error('Cover cache was not rebuilt')
          // J — zero resultados orienta; provider offline não bloqueia o cadastro manual.
          window.location.hash = '/library'
          await waitFor(() => document.querySelector('.library-page'), 'biblioteca offline')
          clickButton(document, 'Adicionar obra')
          modal = await waitFor(latestDialog, 'escolha offline')
          modal.querySelector('button[data-add-work-mode="search"]').click()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.metadata-search)'), 'pesquisa offline')
          setInput(modal.querySelector('.metadata-search input'), 'sem resultado')
          await sleep(800)
          if (!modal.querySelector('.metadata-empty')) setInput(modal.querySelector('.metadata-search input'), 'sem resultado ')
          const emptyMetadata = await waitFor(() => modal.querySelector('.metadata-empty'), 'orientação sem resultados', 15000)
          if (!emptyMetadata.textContent.includes('título em inglês') || !emptyMetadata.textContent.includes('pesquisando o título na web')) throw new Error('Empty metadata guidance missing')
          clickButton(modal, 'Tentar outro título')
          setInput(modal.querySelector('.metadata-search input'), 'offline')
          await sleep(800)
          if (!modal.querySelector('.metadata-error')) setInput(modal.querySelector('.metadata-search input'), 'offline ')
          await waitFor(() => modal.querySelector('.metadata-error'), 'erro offline')
          clickButton(modal, 'Adicionar manualmente')
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.work-form)'), 'formulário manual offline')
          setInput(modal.querySelector('input[placeholder="Ex.: Nano Machine"]'), 'Offline Manual E2E')
          clickButton(modal, 'Adicionar obra')
          const offlineWork = await waitFor(async () => (await window.auri.library.query({ search: 'Offline Manual E2E' }))[0], 'cadastro manual offline')
          await waitFor(() => !document.querySelector('dialog[open]'), 'cadastro manual offline fechado')
  
          // Fluxo seguro de URL usa HTML determinístico e confirma a fonte antes do cadastro.
          clickButton(document, 'Adicionar obra')
          modal = await waitFor(latestDialog, 'escolha de cadastro por URL')
          modal.querySelector('button[data-add-work-mode="url"]').click()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.url-analyze-form)'), 'formulário de URL')
          setInput(modal.querySelector('input[type="url"]'), 'https://reader.e2e.example/original')
          clickButton(modal, 'Analisar URL')
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.url-metadata-preview)'), 'preview de URL')
          if (!modal.querySelector('h3')?.textContent.includes('URL Smoke Work')) throw new Error('Metadata segura da URL não foi exibida.')
          clickButton(modal, 'Continuar com dados detectados')
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.work-form)'), 'cadastro manual vindo da URL')
          clickButton(modal, 'Adicionar obra')
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
          await waitFor(() => modal.querySelector('.quick-search__state')?.textContent.includes('Nenhuma obra ou ação encontrada'), 'busca rápida vazia')
          setInput(modal.querySelector('.quick-search input'), 'E2E IPC ERROR')
          await waitFor(() => modal.querySelector('.quick-search__state[role="alert"]'), 'erro tratado da busca rápida')
          if (!byText(modal, 'Tentar novamente')) throw new Error('Retry ausente na busca rápida.')
          modal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
          await waitFor(() => !document.querySelector('dialog[open]'), 'busca rápida fechada')
  
          // Cancelamentos normais de backup/exportação não geram erro.
          window.location.hash = '/settings'
          await waitFor(() => document.querySelector('.settings-page'), 'Configurações para cancelamentos')
          clickButton(document, 'Backup e dados')
          await waitFor(() => byText(document, 'Exportar JSON'), 'ações de portabilidade')
          const errorsBeforeCancel = document.querySelectorAll('.toast--error').length
          clickButton(document, 'Exportar JSON')
          await sleep(120)
          clickButton(document, 'Escolher backup')
          await sleep(120)
          if (document.querySelectorAll('.toast--error').length !== errorsBeforeCancel || document.querySelector('dialog[open]')) throw new Error('Cancelamento de backup/export foi tratado como erro.')
  
          // Confirmações do Auri preservam foco, prendem Tab e impedem ação destrutiva duplicada.
          const backupsBeforeCreate = (await window.auri.backup.state()).backups.length
          clickButton(document, 'Criar backup')
          await waitFor(async () => (await window.auri.backup.state()).backups.length === backupsBeforeCreate + 1, 'backup criado para modal')
          clickButton(document, 'Gerenciar backups')
          const backupMenu = await waitFor(() => document.querySelector('dialog[open] .backup-manager-list .backup-item-menu'), 'ações do backup criado')
          const backupTrigger = backupMenu.querySelector('button[aria-haspopup="menu"]')
          const openDeleteBackup = async () => byText(await openMenu(backupMenu), 'Excluir backup').click()
          await openDeleteBackup()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.backup-dialog-context)'), 'modal Auri de exclusão de backup')
          if (modal.getAttribute('role') !== 'dialog' || modal.getAttribute('aria-modal') !== 'true' || !modal.textContent.includes('Excluir este backup?') || !modal.textContent.includes('será excluído permanentemente')) throw new Error('Modal destrutivo de backup incompleto.')
          await sleep(80)
          const cancelBackupDelete = byText(modal, 'Cancelar')
          let confirmBackupDelete = byText(modal, 'Excluir backup')
          if (document.activeElement !== cancelBackupDelete) throw new Error('Foco destrutivo inicial não ficou em Cancelar.')
          confirmBackupDelete.focus()
          confirmBackupDelete.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
          if (document.activeElement !== cancelBackupDelete) throw new Error('Tab escapou do modal de backup.')
          modal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
          await waitFor(() => !modal.open, 'cancelamento por Escape do backup')
          await waitFor(() => document.activeElement === backupTrigger, 'foco devolvido ao menu do backup')
          await openDeleteBackup()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.backup-dialog-context)'), 'reabertura do modal de backup')
          confirmBackupDelete = byText(modal, 'Excluir backup')
          const backupsBeforeDelete = (await window.auri.backup.state()).backups.length
          confirmBackupDelete.click()
          confirmBackupDelete.click()
          await waitFor(async () => !modal.open && (await window.auri.backup.state()).backups.length === backupsBeforeDelete - 1, 'exclusão única do backup')
          clickButton(latestDialog(), 'Fechar')
          await waitFor(() => !latestDialog(), 'gerenciador de backups fechado')
  
          // Home — ocultação independente, menu sem click-through, fila única e callbacks corretos de Desfazer.
          while (document.querySelector('.toast__close')) { document.querySelector('.toast__close').click(); await sleep(40) }
          const homeTargets = await Promise.all([imported.work.id, offlineWork.id, urlWork.id].map((workId) => window.auri.works.get({ workId })))
          for (const target of homeTargets) await window.auri.works.update({ id: target.id, userStatus: 'reading', hiddenFromHome: false })
          window.dispatchEvent(new Event('auri:data-changed'))
          window.location.hash = '/'
          await waitFor(() => document.querySelector('.home-section'), 'Home para ocultação')
          const findHomeCard = (title) => Array.from(document.querySelectorAll('.home-work-card')).find((card) => card.querySelector('h3')?.textContent === title)
          const hideCard = async (target, testKeyboard = false) => {
            const card = await waitFor(() => findHomeCard(target.title), 'card da Home ' + target.title)
            const menu = card.querySelector('[data-keyboard-menu]')
            const trigger = menu.querySelector('button[aria-haspopup="menu"]')
            const hashBefore = window.location.hash
            card.scrollIntoView({ block: 'nearest' })
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            trigger.focus({ preventScroll: true })
            let panel = await openMenu(menu)
            if (window.location.hash !== hashBefore) throw new Error('Menu da Home abriu a obra.')
            if (testKeyboard) {
              panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
              await waitFor(() => !panel.isConnected && document.activeElement === trigger, 'Escape e foco do menu da Home')
              panel = await openMenu(menu)
            }
            clickButton(panel, 'Ocultar da Home')
            await waitFor(async () => (await window.auri.works.get({ workId: target.id })).hiddenFromHome && !findHomeCard(target.title), 'ocultar ' + target.title)
            if (window.location.hash !== hashBefore) throw new Error('Ocultar da Home causou click-through.')
          }
          await hideCard(homeTargets[0], true)
          await hideCard(homeTargets[1])
          await hideCard(homeTargets[2])
          if (document.querySelectorAll('.toast').length !== 2) throw new Error('Toaster não respeitou os dois slots visíveis.')
          const visibleToasts = Array.from(document.querySelectorAll('.toast:has(.toast__action)'))
          const activeToast = visibleToasts[0]
          if (!activeToast) throw new Error('Toast com Desfazer não foi exibido.')
          activeToast.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
          await sleep(9300)
          if (!document.body.contains(activeToast)) throw new Error('Hover não pausou o timeout do toast com ação.')
          activeToast.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
          clickButton(activeToast, 'Desfazer')
          await waitFor(async () => !(await window.auri.works.get({ workId: homeTargets[0].id })).hiddenFromHome, 'Desfazer da primeira obra')
          await waitFor(() => !activeToast.isConnected, 'saída do primeiro toast')
          const promotedToast = await waitFor(() => Array.from(document.querySelectorAll('.toast:has(.toast__action)'))
            .find((toast) => !visibleToasts.includes(toast)), 'toast promovido da terceira obra')
          clickButton(promotedToast, 'Desfazer')
          await waitFor(async () => !(await window.auri.works.get({ workId: homeTargets[2].id })).hiddenFromHome, 'Desfazer da terceira obra')
          if (!(await window.auri.works.get({ workId: homeTargets[1].id })).hiddenFromHome) throw new Error('Callback de Desfazer restaurou a obra errada.')
  
          // Configurações oferece um gerenciador enxuto para restaurar obras ocultas.
          window.location.hash = '/settings'
          await waitFor(() => document.querySelector('.settings-page'), 'Configurações para obras ocultas')
          document.querySelector('[data-settings-section="library"]').click()
          const hiddenManagerButton = await waitFor(() => byText(document.querySelector('.settings-panel'), 'Gerenciar'), 'gerenciador de obras ocultas')
          hiddenManagerButton.click()
          modal = await waitFor(() => document.querySelector('dialog[open]:has(.hidden-home-list)'), 'dialog de obras ocultas')
          await waitFor(() => modal.textContent.includes(homeTargets[1].title), 'obra ocultada no gerenciador')
          clickButton(modal, 'Mostrar na Home')
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


