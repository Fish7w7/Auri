import { spawn } from 'node:child_process'
import { clipboard, shell, type App } from 'electron'
import { BrowserExtensionService, embeddedDirectory, verifyEmbeddedDirectory } from './browser-extension-service'
import { detectBrowsers, windowsBrowserDetection } from './browser-detection'
import { isBrowserRunning } from './browser-processes'

// A successful spawn only confirms dispatch. Chromium may reject internal URLs;
// the renderer must keep manual navigation available and never claim page load.
export function launchBrowser(executable: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

export function createBrowserExtensionService(app: App): BrowserExtensionService {
  const folder = embeddedDirectory(app.isPackaged, process.resourcesPath, app.getAppPath())
  return new BrowserExtensionService({
    folder,
    detect: () => detectBrowsers(windowsBrowserDetection),
    isRunning: isBrowserRunning,
    embeddedAvailable: () => verifyEmbeddedDirectory(folder),
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
    copyText: (text) => clipboard.writeText(text),
    launch: launchBrowser
  })
}
