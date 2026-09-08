import { contextBridge, ipcRenderer } from 'electron'
import type { AuriApi } from '@shared/contracts'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'
import { createDesktopCommandsApi } from './api/desktop-commands-api'
import { createBrowserExtensionApi } from './api/browser-extension-api'

const auriApi = Object.freeze<AuriApi>({
  browserExtension: createBrowserExtensionApi(ipcRenderer),
  system: systemApi,
  settings: settingsApi,
  ...domainApi,
  desktopCommands: createDesktopCommandsApi(ipcRenderer)
})

contextBridge.exposeInMainWorld('auri', auriApi)
