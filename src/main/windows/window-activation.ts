export interface ActivatableMainWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  isVisible(): boolean
  restore(): void
  show(): void
  moveTop(): void
  focus(): void
}

export interface ForegroundCapableMainWindow extends ActivatableMainWindow {
  isFocused(): boolean
  isAlwaysOnTop(): boolean
  setAlwaysOnTop(flag: boolean): void
}

export interface ExplicitWindowActivationOptions {
  focusApplication(): void
  platform?: NodeJS.Platform
}

export function activateMainWindow(window: ActivatableMainWindow): void {
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
