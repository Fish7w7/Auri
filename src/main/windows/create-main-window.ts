import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

export interface MainWindowOptions {
  showWhenReady?: boolean
  keepRenderingWhenHidden?: boolean
}

export function createMainWindow({ showWhenReady = true, keepRenderingWhenHidden = false }: MainWindowOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#111016',
    autoHideMenuBar: true,
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
