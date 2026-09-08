import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import type { BrowserExtensionApi } from '@shared/contracts/browser-extension'
import type { ApiResult } from '@shared/errors/domain-error'

export function createBrowserExtensionApi(ipc: { invoke(channel: string, ...args: unknown[]): Promise<unknown> }): BrowserExtensionApi {
  async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const result = await ipc.invoke(channel, ...args) as ApiResult<T>
    if (!result.ok) throw new Error(result.error.message)
    return result.data
  }
  const channels = IPC_CHANNELS.browserExtension
  return Object.freeze({
    getStatus: () => invoke(channels.getStatus),
    openEdgeStore: () => invoke(channels.openEdgeStore),
    openExtensionsPage: (browser) => invoke(channels.openExtensionsPage, browser),
    openFolder: () => invoke(channels.openFolder),
    copyPath: () => invoke(channels.copyPath),
    copyExtensionsUrl: (browser) => invoke(channels.copyExtensionsUrl, browser)
  } satisfies BrowserExtensionApi)
}
