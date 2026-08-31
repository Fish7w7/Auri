import type { BrowserWindow } from 'electron'
import type { DesktopAddWorkDraft, DesktopWorkChange } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { restoreMainWindow } from '../windows/window-tray-controller'

export class DesktopCommandService {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}
  openWork(workId: string): void { this.sendCommand(IPC_CHANNELS.desktopCommands.openWork, workId) }
  openAddWork(draft: DesktopAddWorkDraft): void { this.sendCommand(IPC_CHANNELS.desktopCommands.openAddWork, draft) }
  notifyWorkChanged(change: DesktopWorkChange): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    const notify = () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(IPC_CHANNELS.desktopCommands.workChanged, change)
    }
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', notify)
    else notify()
  }

  private sendCommand(channel: string, payload: string | DesktopAddWorkDraft): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) throw new Error('A janela principal não está disponível.')
    restoreMainWindow(window)
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', () => window.webContents.send(channel, payload))
    else window.webContents.send(channel, payload)
  }
}
