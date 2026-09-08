import { describe, expect, it, vi } from 'vitest'
import { BROWSER_DEFINITIONS, detectBrowsers, normalizeBrowserExecutable, type BrowserDetectionDependencies } from '@main/services/browser-detection'
import { SUPPORTED_BROWSERS } from '@shared/contracts/browser-extension'

function dependencies(): BrowserDetectionDependencies {
  return { platform: 'win32', environment: { LOCALAPPDATA: 'C:\\User Local', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' }, readAppPath: vi.fn(async () => null), isFile: vi.fn(async () => false) }
}
describe('detecção local dos navegadores sem acesso a perfis', () => {
  it.each(SUPPORTED_BROWSERS)('detecta %s por usuário sem browser real', async (browser) => {
    const deps = dependencies()
    const definition = BROWSER_DEFINITIONS[browser]
    const path = `C:\\User Local\\${definition.directory}\\${definition.exe}`
    deps.isFile = vi.fn(async (candidate) => candidate === path)
    expect((await detectBrowsers(deps))[browser]).toBe(path)
  })
  it('normaliza aspas e separadores com espaços', () => {
    expect(normalizeBrowserExecutable(' "C:/Program Files/Google/Chrome/Application/chrome.exe" ', 'chrome.exe')).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  })
  it.each(['chrome.exe', 'C:chrome.exe', '\\\\server\\chrome.exe', 'C:\\chrome.exe --flag', 'C:\\malware.exe', 'C:\\chrome.exe\narg', 'C:\\x:stream\\chrome.exe'])('recusa path inválido %s', (path) => {
    expect(normalizeBrowserExecutable(path, 'chrome.exe')).toBeNull()
  })
  it('prioriza HKCU 64, depois HKCU 32, antes de HKLM e paths comuns', async () => {
    const deps = dependencies()
    deps.readAppPath = vi.fn(async (hive, exe, view) => exe === 'chrome.exe' && hive === 'HKCU' && view === '32' ? 'D:\\Apps\\chrome.exe' : null)
    deps.isFile = vi.fn(async () => true)
    expect((await detectBrowsers(deps)).chrome).toBe('D:\\Apps\\chrome.exe')
    const chromeCalls = vi.mocked(deps.readAppPath).mock.calls.filter((call) => call[1] === 'chrome.exe')
    expect(chromeCalls).toEqual([['HKCU', 'chrome.exe', '64'], ['HKCU', 'chrome.exe', '32']])
  })
  it('ignora Registry inválido e inacessível, tenta Program Files (x86)', async () => {
    const deps = dependencies()
    deps.readAppPath = vi.fn(async () => { throw new Error('denied') })
    deps.isFile = vi.fn(async (path) => path === 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    expect((await detectBrowsers(deps)).edge).toContain('Program Files (x86)')
  })
  it('retorna ausente quando não existe ou plataforma incompatível', async () => {
    const deps = dependencies()
    expect(await detectBrowsers(deps)).toEqual({ edge: null, chrome: null, brave: null })
    vi.mocked(deps.readAppPath).mockClear(); deps.platform = 'linux'
    expect(await detectBrowsers(deps)).toEqual({ edge: null, chrome: null, brave: null })
    expect(deps.readAppPath).not.toHaveBeenCalled()
  })
  it('somente inspeciona executáveis nos caminhos esperados', async () => {
    const deps = dependencies(); await detectBrowsers(deps)
    const inspected = vi.mocked(deps.isFile).mock.calls.flat()
    expect(inspected).toHaveLength(9)
    expect(inspected.join('\n')).not.toMatch(/User Data|History|Cookies|Preferences|Extensions/)
    expect(inspected.every((path) => path.endsWith('.exe'))).toBe(true)
  })
})
