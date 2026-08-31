import type { IpcRenderer } from 'electron'
import type { DesktopCommandsApi } from '@shared/contracts'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

export function createDesktopCommandsApi(ipc: Pick<IpcRenderer, 'on' | 'removeListener'>): DesktopCommandsApi['desktopCommands'] {
  return {
    onOpenWork: (listener) => subscribe(ipc, IPC_CHANNELS.desktopCommands.openWork, listener),
    onOpenAddWork: (listener) => subscribe(ipc, IPC_CHANNELS.desktopCommands.openAddWork, listener),
    onWorkChanged: (listener) => subscribe(ipc, IPC_CHANNELS.desktopCommands.workChanged, listener)
  }
}

function subscribe<Payload>(
  ipc: Pick<IpcRenderer, 'on' | 'removeListener'>,
  channel: string,
  listener: (payload: Payload) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: Payload) => listener(payload)
  ipc.on(channel, handler)
  return () => ipc.removeListener(channel, handler)
}
