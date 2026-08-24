import { contextBridge } from 'electron'
import type { AuriApi } from '@shared/contracts'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'

const auriApi = Object.freeze<AuriApi>({
  system: systemApi,
  settings: settingsApi,
  ...domainApi
})

contextBridge.exposeInMainWorld('auri', auriApi)
