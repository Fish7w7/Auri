import type { App, BrowserWindow } from 'electron'
import type { SettingsService } from '../services/settings-service'
import { createApplicationTray } from './create-application-tray'
import { createMainWindow, type MainWindowOptions } from './create-main-window'
import { activateMainWindow } from './window-activation'
import { WindowTrayController } from './window-tray-controller'

export class MainWindowController {
  private window: BrowserWindow | null = null
  private trayController: WindowTrayController | null = null
  private settings: SettingsService | null = null

  constructor(private readonly app: App) {}

  attachSettings(settings: SettingsService): void {
    this.settings = settings
    const window = this.getWindow()
    if (window) this.trayController = this.createTrayController(window, settings)
  }

  create(options?: MainWindowOptions): BrowserWindow {
    this.trayController?.dispose()
    const window = createMainWindow(options)
    this.window = window
    this.trayController = this.settings ? this.createTrayController(window, this.settings) : null
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
    this.settings = null
  }

  private createTrayController(window: BrowserWindow, settings: SettingsService): WindowTrayController {
    return new WindowTrayController({
      window,
      getCloseToTray: () => settings.getSettings().closeToTray,
      onCloseToTrayChange: (listener) => settings.onDidChange((next) => listener(next.closeToTray)),
      createTray: createApplicationTray,
      quitApplication: () => this.app.quit()
    })
  }
}
