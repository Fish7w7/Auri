import { contextBridge } from 'electron'
import type { LumiApi } from '@shared/contracts'
import { domainApi, settingsApi } from './api/domain-api'
import { systemApi } from './api/system-api'

const lumiApi = Object.freeze<LumiApi>({
  system: systemApi,
  settings: settingsApi,
  ...domainApi
})

contextBridge.exposeInMainWorld('lumi', lumiApi)
