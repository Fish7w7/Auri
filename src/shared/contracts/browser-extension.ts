export const SUPPORTED_BROWSERS = ['edge', 'chrome', 'brave'] as const
export type SupportedBrowser = typeof SUPPORTED_BROWSERS[number]
export interface BrowserExtensionStatus {
  embeddedVersion: string
  embeddedAvailable: boolean
  browsers: Array<{
    browser: SupportedBrowser
    displayName: string
    installed: boolean
    availableAction: 'store' | 'manual' | null
  }>
}
export interface BrowserExtensionApi {
  getStatus(): Promise<BrowserExtensionStatus>
  openEdgeStore(): Promise<void>
  openExtensionsPage(browser: SupportedBrowser): Promise<void>
  openFolder(): Promise<void>
  copyPath(): Promise<void>
}
