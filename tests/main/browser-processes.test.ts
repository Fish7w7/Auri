import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_PROCESS_QUERY, isBrowserRunning, parseRunningBrowsers } from '@main/services/browser-processes'

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile }))
beforeEach(() => { execFile.mockReset() })

describe('processos de navegadores', () => {
  it('aceita somente nomes conhecidos e lista vazia', () => {
    expect(parseRunningBrowsers('[]')).toEqual([])
    expect(parseRunningBrowsers('["brave","chrome","msedge"]')).toEqual(['brave', 'chrome', 'msedge'])
  })
  it.each(['', 'Access denied', '{}', 'null', '"brave"', '["brave.exe"]', '["other"]'])('recusa resultado inconclusivo %j', (output) => {
    expect(() => parseRunningBrowsers(output)).toThrow()
  })
  it.runIf(process.platform === 'win32').each([
    ['brave', '["brave"]', true], ['chrome', '["chrome"]', true], ['edge', '["msedge"]', true],
    ['brave', '[]', false], ['chrome', '["brave"]', false], ['edge', '[]', false]
  ] as const)('identifica %s em %s como %s', async (browser, output, expected) => {
    execFile.mockImplementation((_exe, _args, _options, callback) => callback(null, output))
    expect(await isBrowserRunning(browser)).toBe(expected)
    expect(execFile).toHaveBeenCalledWith(expect.stringMatching(/WindowsPowerShell\\v1\.0\\powershell\.exe$/),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', BROWSER_PROCESS_QUERY],
      { shell: false, windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024, encoding: 'utf8' }, expect.any(Function))
    expect(BROWSER_PROCESS_QUERY).toContain('$_.SessionId -eq $session')
    expect(BROWSER_PROCESS_QUERY).not.toMatch(/CommandLine|MainWindowTitle|UserData|Preferences/)
  })
  it.runIf(process.platform === 'win32')('propaga timeout/erro para o Main impedir nova abertura', async () => {
    execFile.mockImplementation((_exe, _args, _options, callback) => callback(new Error('timeout'), ''))
    await expect(isBrowserRunning('brave')).rejects.toThrow('timeout')
  })
})
