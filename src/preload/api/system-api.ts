import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import type { LumiApi, SystemStatus } from '@shared/contracts'

export const systemApi: LumiApi['system'] = {
  async getStatus() {
    return ipcRenderer.invoke(IPC_CHANNELS.system.getStatus) as Promise<SystemStatus>
  }
}
