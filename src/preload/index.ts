import { contextBridge, ipcRenderer } from 'electron'
import type { AuriApi } from '@shared/contracts'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'
import { createDesktopCommandsApi } from './api/desktop-commands-api'
import { createBrowserExtensionApi } from './api/browser-extension-api'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

const auriApi = Object.freeze<AuriApi>({
  browserExtension: createBrowserExtensionApi(ipcRenderer),
  system: systemApi,
  settings: settingsApi,
  ...domainApi,
  desktopCommands: createDesktopCommandsApi(ipcRenderer)
})

contextBridge.exposeInMainWorld('auri', auriApi)
contextBridge.exposeInMainWorld('auriStartup', {
  cinematic: process.argv.includes('--auri-cinematic-intro'),
  waitForServices: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.startup.waitForServices)
})
