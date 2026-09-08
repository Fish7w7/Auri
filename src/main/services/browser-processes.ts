import { execFile } from 'node:child_process'
import { win32 } from 'node:path'
import type { SupportedBrowser } from '@shared/contracts/browser-extension'

const PROCESS_NAMES = { edge: 'msedge', chrome: 'chrome', brave: 'brave' } as const
// Read only process names in this Windows session, never profiles, tabs or titles.
export const BROWSER_PROCESS_QUERY = "$ErrorActionPreference = 'Stop'; $session = (Get-Process -Id $PID).SessionId; $names = @(Get-Process | Where-Object { $_.SessionId -eq $session -and $_.ProcessName -in @('msedge','chrome','brave') } | Select-Object -ExpandProperty ProcessName -Unique); ConvertTo-Json -InputObject $names -Compress"

export function parseRunningBrowsers(output: string): string[] {
  const names: unknown = JSON.parse(output.trim())
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string' || !Object.values(PROCESS_NAMES).includes(name as 'msedge' | 'chrome' | 'brave'))) throw new Error('Invalid process query result')
  return names
}

export async function isBrowserRunning(browser: SupportedBrowser): Promise<boolean> {
  if (process.platform !== 'win32') throw new Error('Unsupported process detection platform')
  const executable = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const output = await new Promise<string>((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', BROWSER_PROCESS_QUERY],
      { shell: false, windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024, encoding: 'utf8' },
      (error, stdout) => { if (error) reject(error); else resolve(stdout) })
  })
  return parseRunningBrowsers(output).includes(PROCESS_NAMES[browser])
}
