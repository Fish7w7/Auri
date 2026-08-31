import { contextBridge, ipcRenderer } from 'electron'
import type { AuriApi } from '@shared/contracts'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'
import { createDesktopCommandsApi } from './api/desktop-commands-api'

const auriApi = Object.freeze<AuriApi>({
  system: systemApi,
  settings: settingsApi,
  ...domainApi,
  desktopCommands: createDesktopCommandsApi(ipcRenderer)
})

contextBridge.exposeInMainWorld('auri', auriApi)
