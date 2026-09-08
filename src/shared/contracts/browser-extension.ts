export const SUPPORTED_BROWSERS = ['edge', 'chrome', 'brave'] as const
export type SupportedBrowser = typeof SUPPORTED_BROWSERS[number]
export const BROWSER_EXTENSIONS_URLS = {
  edge: 'edge://extensions/',
  chrome: 'chrome://extensions/',
  brave: 'brave://extensions/'
} as const satisfies Record<SupportedBrowser, string>
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
  openExtensionsPage(browser: SupportedBrowser): Promise<BrowserOpenResult>
  openFolder(): Promise<void>
  copyPath(): Promise<void>
  copyExtensionsUrl(browser: SupportedBrowser): Promise<void>
}
export interface BrowserOpenResult {
  state: 'already-running' | 'launch-requested' | 'unknown'
}
