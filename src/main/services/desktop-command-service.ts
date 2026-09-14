import type { BrowserWindow } from 'electron'
import type { DesktopAddWorkDraft, DesktopWorkChange } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import {
  activateMainWindow,
  activateMainWindowFromExplicitUserAction
} from '../windows/window-tray-controller'

export interface DesktopCommandServiceOptions {
  focusApplication?: () => void
  platform?: NodeJS.Platform
}

export class DesktopCommandService {
  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly options: DesktopCommandServiceOptions = {}
  ) {}
  openWork(workId: string): void { this.sendCommand(IPC_CHANNELS.desktopCommands.openWork, workId) }
  openAddWork(draft: DesktopAddWorkDraft): void {
    this.sendCommand(IPC_CHANNELS.desktopCommands.openAddWork, draft, true)
  }
  notifyWorkChanged(change: DesktopWorkChange): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    const notify = () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(IPC_CHANNELS.desktopCommands.workChanged, change)
    }
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', notify)
    else notify()
  }

  private sendCommand(channel: string, payload: string | DesktopAddWorkDraft, explicitUserAction = false): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) throw new Error('A janela principal não está disponível.')
    if (explicitUserAction) {
      activateMainWindowFromExplicitUserAction(window, {
        focusApplication: this.options.focusApplication ?? (() => undefined),
        platform: this.options.platform
      })
    } else activateMainWindow(window)
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', () => window.webContents.send(channel, payload))
    else window.webContents.send(channel, payload)
  }
}
