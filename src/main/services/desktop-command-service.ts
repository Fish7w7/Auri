import type { BrowserWindow } from 'electron'
import type { DesktopAddWorkDraft } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { restoreMainWindow } from '../windows/window-tray-controller'

export class DesktopCommandService {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}
  openWork(workId: string): void { this.send(IPC_CHANNELS.desktopCommands.openWork, workId) }
  openAddWork(draft: DesktopAddWorkDraft): void { this.send(IPC_CHANNELS.desktopCommands.openAddWork, draft) }

  private send(channel: string, payload: string | DesktopAddWorkDraft): void {
    const window = this.getWindow()
    if (!window || window.isDestroyed()) throw new Error('A janela principal não está disponível.')
    restoreMainWindow(window)
    if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', () => window.webContents.send(channel, payload))
    else window.webContents.send(channel, payload)
  }
}
