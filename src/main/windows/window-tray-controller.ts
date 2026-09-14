export interface PreventableCloseEvent {
  preventDefault(): void
}

export interface ManagedMainWindow {
  on(event: 'close', listener: (event: PreventableCloseEvent) => void): unknown
  on(event: 'query-session-end', listener: () => void): unknown
  isDestroyed(): boolean
  isMinimized(): boolean
  isVisible(): boolean
  restore(): void
  show(): void
  moveTop(): void
  focus(): void
  hide(): void
}

export interface ForegroundCapableMainWindow extends ManagedMainWindow {
  isFocused(): boolean
  isAlwaysOnTop(): boolean
  setAlwaysOnTop(flag: boolean): void
}

export interface ExplicitWindowActivationOptions {
  focusApplication(): void
  platform?: NodeJS.Platform
}

export interface TrayHandle {
  destroy(): void
}

export interface TrayActions {
  open(): void
  quit(): void
}

export interface WindowTrayControllerOptions {
  window: ManagedMainWindow
  getCloseToTray(): boolean
  onCloseToTrayChange(listener: (enabled: boolean) => void): () => void
  createTray(actions: TrayActions): TrayHandle
  quitApplication(): void
}

export function activateMainWindow(window: ManagedMainWindow): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.moveTop()
  window.focus()
}

export function activateMainWindowFromExplicitUserAction(
  window: ForegroundCapableMainWindow,
  options: ExplicitWindowActivationOptions
): void {
  if (window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()

  try { options.focusApplication() } catch { /* Activation remains best-effort. */ }
  window.moveTop()
  window.focus()

  if ((options.platform ?? process.platform) !== 'win32' || window.isFocused()) return

  let previousAlwaysOnTop: boolean | undefined
  try {
    previousAlwaysOnTop = window.isAlwaysOnTop()
    window.setAlwaysOnTop(true)
    window.moveTop()
    window.focus()
  } catch {
    // The command still reaches the renderer when Windows refuses activation.
  } finally {
    if (previousAlwaysOnTop !== undefined && !window.isDestroyed()) {
      try { window.setAlwaysOnTop(previousAlwaysOnTop) } catch { /* Window may be closing. */ }
    }
  }
}

export class WindowTrayController {
  private tray: TrayHandle | null = null
  private closeToTray: boolean
  private quitting = false
  private readonly unsubscribeSettings: () => void

  constructor(private readonly options: WindowTrayControllerOptions) {
    this.closeToTray = options.getCloseToTray()
    options.window.on('close', (event) => this.handleClose(event))
    options.window.on('query-session-end', () => this.beginQuit())
    this.unsubscribeSettings = options.onCloseToTrayChange((enabled) => {
      this.closeToTray = enabled
      this.syncTray()
    })
    this.syncTray()
  }

  beginQuit(): void {
    if (this.quitting) return
    this.quitting = true
    this.destroyTray()
  }

  dispose(): void {
    this.unsubscribeSettings()
    this.destroyTray()
  }

  private handleClose(event: PreventableCloseEvent): void {
    if (!this.closeToTray || this.quitting) return
    event.preventDefault()
    this.options.window.hide()
  }

  private syncTray(): void {
    if (this.closeToTray && !this.tray && !this.quitting) {
      this.tray = this.options.createTray({
        open: () => activateMainWindow(this.options.window),
        quit: () => {
          this.beginQuit()
          this.options.quitApplication()
        }
      })
      return
    }
    if (!this.closeToTray) this.destroyTray()
  }

  private destroyTray(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
