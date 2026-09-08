import { win32 } from 'node:path'
import { stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { SUPPORTED_BROWSERS, type SupportedBrowser } from '@shared/contracts/browser-extension'

export const BROWSER_DEFINITIONS = {
  edge: { displayName: 'Microsoft Edge', exe: 'msedge.exe', directory: 'Microsoft\\Edge\\Application', url: 'edge://extensions/' },
  chrome: { displayName: 'Google Chrome', exe: 'chrome.exe', directory: 'Google\\Chrome\\Application', url: 'chrome://extensions/' },
  brave: { displayName: 'Brave', exe: 'brave.exe', directory: 'BraveSoftware\\Brave-Browser\\Application', url: 'brave://extensions/' }
} as const

export interface BrowserDetectionDependencies {
  platform: string
  environment: NodeJS.ProcessEnv
  readAppPath(hive: 'HKCU' | 'HKLM', exe: string, view: '64' | '32'): Promise<string | null>
  isFile(path: string): Promise<boolean>
}

export function normalizeBrowserExecutable(value: string, exe: string): string | null {
  const trimmed = value.trim().replace(/^"([^"\r\n]+)"$/, '$1')
  if (!/^[a-z]:[\\/]/i.test(trimmed) || /["\r\n\0]/.test(trimmed) || trimmed.slice(2).includes(':')) return null
  const path = win32.normalize(trimmed)
  return win32.basename(path).toLowerCase() === exe ? path : null
}

export async function detectBrowsers(deps: BrowserDetectionDependencies): Promise<Record<SupportedBrowser, string | null>> {
  const result: Record<SupportedBrowser, string | null> = { edge: null, chrome: null, brave: null }
  if (deps.platform !== 'win32') return result
  await Promise.all(SUPPORTED_BROWSERS.map(async (browser) => {
    const { exe, directory } = BROWSER_DEFINITIONS[browser]
    const accept = async (value: string | null) => {
      const normalized = value ? normalizeBrowserExecutable(value, exe) : null
      if (!normalized) return false
      try { if (await deps.isFile(normalized)) { result[browser] = normalized; return true } } catch { /* Try next known location. */ }
      return false
    }
    for (const hive of ['HKCU', 'HKLM'] as const) {
      for (const view of ['64', '32'] as const) {
        let value: string | null = null
        try { value = await deps.readAppPath(hive, exe, view) } catch { /* Missing/inaccessible registry entry. */ }
        if (await accept(value)) return
      }
    }
    for (const base of [deps.environment.LOCALAPPDATA, deps.environment.ProgramFiles, deps.environment['ProgramFiles(x86)']]) {
      if (base && await accept(win32.join(base, directory, exe))) return
    }
  }))
  return result
}

export const windowsBrowserDetection: BrowserDetectionDependencies = {
  platform: process.platform,
  environment: process.env,
  isFile: async (path) => (await stat(path)).isFile(),
  readAppPath: (hive, exe, view) => new Promise((resolve) => {
    const reg = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
    execFile(reg, ['query', `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, '/ve', `/reg:${view}`],
      { windowsHide: true, shell: false, timeout: 2500, maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (error) { resolve(null); return }
        const match = stdout.match(/REG_(?:SZ|EXPAND_SZ)\s+([^\r\n]+)/)
        resolve(match?.[1]?.replace(/%([^%]+)%/g, (original, key: string) => process.env[key] ?? original) ?? null)
      })
  })
}
