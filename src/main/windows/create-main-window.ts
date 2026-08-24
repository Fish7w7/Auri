import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'

export interface MainWindowOptions {
  showWhenReady?: boolean
  keepRenderingWhenHidden?: boolean
}

export function createMainWindow({ showWhenReady = true, keepRenderingWhenHidden = false }: MainWindowOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_BRAND.name,
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#111016',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#15141a',
      symbolColor: '#f2f0f5'
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: !keepRenderingWhenHidden
    }
  })

  if (showWhenReady) {
    window.once('ready-to-show', () => window.show())
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
