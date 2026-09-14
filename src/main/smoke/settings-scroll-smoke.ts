import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, type BrowserWindow } from 'electron'

export function registerSettingsScrollSmoke(mainWindow: BrowserWindow): void {
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

