import type { App, BrowserWindow } from 'electron'
import type { AppContext } from '../app/create-app-context'
import { createApplicationTray } from './create-application-tray'
import { createMainWindow, type MainWindowOptions } from './create-main-window'
import { activateMainWindow } from './window-activation'
import { WindowTrayController } from './window-tray-controller'

export class MainWindowController {
  private window: BrowserWindow | null = null
  private trayController: WindowTrayController | null = null

  constructor(
    private readonly app: App,
    private readonly context: AppContext
  ) {}

  create(options?: MainWindowOptions): BrowserWindow {
    this.trayController?.dispose()
    const window = createMainWindow(options)
    this.window = window
    this.trayController = this.createTrayController(window)
    window.once('closed', () => {
      if (this.window === window) this.window = null
    })
    return window
  }

  getWindow(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  activateExisting(): void {
    const window = this.getWindow()
    if (window) activateMainWindow(window)
  }

  createIfMissing(options?: MainWindowOptions): BrowserWindow {
    return this.getWindow() ?? this.create(options)
  }

  beginQuit(): void {
    this.trayController?.beginQuit()
  }

  dispose(): void {
    this.trayController?.dispose()
    this.trayController = null
    this.window = null
  }

  private createTrayController(window: BrowserWindow): WindowTrayController {
    const settings = this.context.services.settings
    return new WindowTrayController({
      window,
      getCloseToTray: () => settings.getSettings().closeToTray,
      onCloseToTrayChange: (listener) => settings.onDidChange((next) => listener(next.closeToTray)),
      createTray: createApplicationTray,
      quitApplication: () => this.app.quit()
    })
  }
}
