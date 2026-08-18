import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import type { ApiResult, DomainErrorShape, LumiApi, SystemStatus } from '@shared/contracts'
import { LumiClientError } from './domain-api'

async function invoke<T>(channel: string): Promise<T> {
  const result = (await ipcRenderer.invoke(channel)) as ApiResult<T>
  if (!result.ok) throw new LumiClientError(result.error as DomainErrorShape)
  return result.data
}

export const systemApi: LumiApi['system'] = {
  async getStatus() {
    return ipcRenderer.invoke(IPC_CHANNELS.system.getStatus) as Promise<SystemStatus>
  },
  getDiagnostics: () => invoke(IPC_CHANNELS.system.getDiagnostics),
  checkIntegrity: () => invoke(IPC_CHANNELS.system.checkIntegrity),
  clearCoverCache: () => invoke(IPC_CHANNELS.system.clearCoverCache),
  openDataFolder: () => invoke(IPC_CHANNELS.system.openDataFolder),
  openBackupsFolder: () => invoke(IPC_CHANNELS.system.openBackupsFolder),
  openLogsFolder: () => invoke(IPC_CHANNELS.system.openLogsFolder),
  copySystemInfo: () => invoke(IPC_CHANNELS.system.copySystemInfo),
  exportDiagnostic: () => invoke(IPC_CHANNELS.system.exportDiagnostic)
}
