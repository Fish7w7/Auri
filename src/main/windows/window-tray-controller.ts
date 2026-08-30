export interface PreventableCloseEvent {
  preventDefault(): void
}

export interface ManagedMainWindow {
  on(event: 'close', listener: (event: PreventableCloseEvent) => void): unknown
  on(event: 'query-session-end', listener: () => void): unknown
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
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

export function restoreMainWindow(window: ManagedMainWindow): void {
  if (window.isDestroyed()) return
  window.show()
  if (window.isMinimized()) window.restore()
  window.focus()
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
        open: () => restoreMainWindow(this.options.window),
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
