import { contextBridge, ipcRenderer } from 'electron'
import type { AuriApi } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'

const auriApi = Object.freeze<AuriApi>({
  system: systemApi,
  settings: settingsApi,
  ...domainApi,
  desktopCommands: {
    onOpenWork(listener) {
      const handler = (_event: Electron.IpcRendererEvent, workId: string) => listener(workId)
      ipcRenderer.on(IPC_CHANNELS.desktopCommands.openWork, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopCommands.openWork, handler)
    },
    onOpenAddWork(listener) {
      const handler = (_event: Electron.IpcRendererEvent, draft: Parameters<typeof listener>[0]) => listener(draft)
      ipcRenderer.on(IPC_CHANNELS.desktopCommands.openAddWork, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopCommands.openAddWork, handler)
    }
  }
})

contextBridge.exposeInMainWorld('auri', auriApi)
