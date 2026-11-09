import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, desktopCapturer } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'

export function registerScreenshotSmoke(mainWindow: BrowserWindow): void {
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
          const trigger = document.querySelector('.home-work-menu button[aria-haspopup="menu"]')
          trigger?.click()
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const panel = trigger && document.getElementById(trigger.getAttribute('aria-controls'))
            const panelBounds = panel?.getBoundingClientRect()
            const anchor = trigger?.getBoundingClientRect()
            if (trigger?.getAttribute('aria-expanded') !== 'true' || !panel || !panelBounds || !anchor) return reject(new Error('Menu da Home não abriu para o smoke visual.'))
            const separated = panelBounds.bottom <= anchor.top - 4 || panelBounds.top >= anchor.bottom + 4
            if (getComputedStyle(panel).position !== 'fixed' || !separated || panelBounds.height > 100) return reject(new Error('Menu da Home entrou no fluxo, sobrepôs o botão ou ficou esticado.'))
            resolve(true)
          }))
        })
      `))
      .then(() => mainWindow.webContents.capturePage())
      .then((image) => writeFileSync(join(output, 'auri-home-menu.png'), image.toPNG()))
      .then(() => mainWindow.webContents.executeJavaScript(`document.querySelector('.home-work-menu button[aria-expanded="true"]')?.click()`))
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
          const check = () => document.querySelector('.settings-panel h2')?.textContent === 'Backup e dados'
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
          const buttons = (root) => Array.from(root?.querySelectorAll('button') ?? [])
          const find = (root, name) => buttons(root).find((button) => button.textContent.trim() === name && !button.disabled)
          const settings = document.querySelector('.settings-panel')
          const create = find(settings, 'Criar backup')
          if (!create) return reject(new Error('Botão Criar backup ausente.'))
          create.click()
          const started = Date.now()
          let managerOpened = false
          let triggerClicked = false
          const check = () => {
            const manager = find(settings, 'Gerenciar backups')
            if (!managerOpened && manager && !create.disabled) { managerOpened = true; manager.click() }
            const trigger = document.querySelector('dialog[open] .backup-manager-list .backup-item-menu button[aria-haspopup="menu"]')
            if (trigger && !triggerClicked) {
              triggerClicked = true
              requestAnimationFrame(() => requestAnimationFrame(() => trigger.click()))
            }
            const remove = document.querySelector('dialog[open] .backup-item-menu__popover button.is-danger:not(:disabled)')
            if (remove) { remove.click(); resolve(true) }
            else if (Date.now() - started > 5000) reject(new Error('Modal visual de exclusão de backup não abriu. ' + JSON.stringify({
              managerOpened, triggerClicked, openDialogs: Array.from(document.querySelectorAll('dialog[open] h2'), (heading) => heading.textContent),
              backupActions: Array.from(document.querySelectorAll('dialog[open] [role="menu"] button'), (button) => button.textContent.trim())
            })))
            else setTimeout(check, 50)
          }
          check()
        })
      `))
      .then(() => mainWindow.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const started = Date.now()
          const check = () => {
            const dialog = document.querySelector('dialog[open]:has(.backup-dialog-context)')
            if (dialog) {
              const context = dialog.querySelector('.backup-dialog-context')
              if (!context.querySelector('strong')?.textContent || !context.querySelector('time[datetime]') || !dialog.querySelector('.button--danger')) reject(new Error('Modal destrutivo sem identificação do backup ou ação clara.'))
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
          const dialog = document.querySelector('dialog[open]:has(.backup-dialog-context)')
          const confirm = Array.from(dialog?.querySelectorAll('button') ?? []).find((button) => button.textContent.trim() === 'Excluir backup')
          confirm?.click()
          const started = Date.now()
          const check = () => {
            if (!document.querySelector('dialog[open]:has(.backup-dialog-context)')) {
              const manager = document.querySelector('dialog[open]:has(.backup-manager-list)')
              const close = Array.from(manager?.querySelectorAll('button') ?? []).find((button) => button.textContent.trim() === 'Fechar')
              close?.click()
              if (!manager) return resolve(true)
            }
            if (Date.now() - started > 5000) reject(new Error('Confirmação ou gerenciador de backups não fechou.'))
            else setTimeout(check, 50)
          }
          check()
        })
      `))
      .then(() => mainWindow.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
          const updates = Array.from(document.querySelectorAll('.settings-layout nav button')).find((button) => button.textContent.trim() === 'Atualizações')
          updates?.click()
          const started = Date.now()
          const check = () => {
            const card = document.querySelector('.settings-panel .update-summary')
            const notes = document.querySelector('.release-notes__content')
            if (card && notes) {
                if (notes.textContent.includes('<h1>') || window.__auriUnsafeReleaseNote) return reject(new Error('HTML remoto inseguro foi executado ou exibido cru.'))
                if (notes.querySelector('script, iframe, style, object, embed')) return reject(new Error('Elemento remoto inseguro permaneceu no Renderer.'))
                if (!notes.querySelector('h1, h2') || !notes.querySelector('ul li') || !notes.querySelector('strong') || !notes.querySelector('a[href^="https://"]')) return reject(new Error('Estrutura das release notes ficou incompleta.'))
                const expand = document.querySelector('.release-notes__toggle[aria-expanded="false"]')
                // The Renderer measures overflow in an effect after mounting the notes.
                if (notes.scrollHeight > notes.clientHeight && expand) {
                  expand.click()
                  return resolve(true)
                }
                if (Date.now() - started > 5000) return reject(new Error('A prévia de notas extensas não ofereceu expansão.'))
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
          if (!notes?.classList.contains('is-expanded') || !notes.textContent.includes('Janela integrada ao Auri')) throw new Error('Release notes não permaneceram abertas antes da captura.')
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
          const check = () => document.querySelector('.settings-panel .settings-info-list')
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
          const exit = document.querySelector('.bulk-toolbar button[aria-label="Sair da seleção"]')
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

async function captureNativeWindow(window: BrowserWindow, destination: string): Promise<void> {
  const bounds = window.getBounds()
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: bounds.width, height: bounds.height }, fetchWindowIcons: false })
  const source = sources.find((candidate) => candidate.name === APP_BRAND.name) ?? sources.find((candidate) => candidate.name.includes(APP_BRAND.name))
  if (!source || source.thumbnail.isEmpty()) throw new Error('A captura nativa da janela do Auri não foi encontrada.')
  writeFileSync(destination, source.thumbnail.toPNG())
}


