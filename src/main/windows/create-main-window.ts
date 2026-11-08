import { join } from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { APP_BRAND } from '@shared/constants/app-branding'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

export interface MainWindowOptions {
  showWhenReady?: boolean | (() => boolean)
  keepRenderingWhenHidden?: boolean
  cinematicIntro?: boolean
  servicesReady?: Promise<boolean>
}

export function createMainWindow({
  showWhenReady = true, keepRenderingWhenHidden = false, cinematicIntro = false, servicesReady
}: MainWindowOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_BRAND.name,
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#090d15',
    autoHideMenuBar: true,
    icon: resolveWindowIcon(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#f7f0da'
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      additionalArguments: cinematicIntro ? ['--auri-cinematic-intro'] : [],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: !keepRenderingWhenHidden
    }
  })

  window.webContents.ipc.handle(IPC_CHANNELS.startup.waitForServices, (event) =>
    event.senderFrame === window.webContents.mainFrame ? servicesReady ?? true : false
  )

  if (showWhenReady) {
    window.once('ready-to-show', () => {
      if (showWhenReady === true || showWhenReady()) window.show()
    })
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL()
    if (url !== currentUrl) event.preventDefault()
  })

  const loading = process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(process.env.ELECTRON_RENDERER_URL)
    : window.loadFile(join(__dirname, '../renderer/index.html'))
  void loading.catch((error: unknown) => {
    if (window.isDestroyed()) return
    console.error('Falha ao carregar a interface do Auri.', error)
    dialog.showErrorBox('Auri', 'Não foi possível carregar a interface do Auri.')
    if (!window.isDestroyed()) window.destroy()
  })

  return window
}

export function resolveWindowIcon(): string {
  return process.env.ELECTRON_RENDERER_URL
    ? join(process.cwd(), 'src/renderer/public', APP_BRAND.iconFileName)
    : join(__dirname, '../renderer', APP_BRAND.iconFileName)
}
