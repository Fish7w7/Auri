import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserExtensionService, embeddedDirectory, verifyEmbeddedDirectory, type BrowserExtensionDependencies } from '@main/services/browser-extension-service'
import { createBrowserExtensionApi } from '../../src/preload/api/browser-extension-api'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { readFileSync } from 'node:fs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
function fixture() {
  const deps: BrowserExtensionDependencies = {
    folder: resolve('build/generated/browser-extension'),
    isRunning: vi.fn(async () => false),
    detect: vi.fn(async () => ({ edge: 'C:\\Edge\\msedge.exe', chrome: 'C:\\Chrome\\chrome.exe', brave: 'C:\\Brave\\brave.exe' })),
    embeddedAvailable: vi.fn(async () => true), launch: vi.fn(async () => {}), openExternal: vi.fn(async () => {}), openPath: vi.fn(async () => ''), copyText: vi.fn()
  }
  return { deps, service: new BrowserExtensionService(deps) }
}
describe('ações restritas da extensão no Main', () => {
  it.each(['chrome', 'brave', 'edge'] as const)('mantém %s existente sem abrir processo, janela ou URL', async (browser) => {
    const { service, deps } = fixture()
    deps.isRunning = vi.fn(async () => true)
    expect(await service.openExtensionsPage(browser)).toEqual({ state: 'already-running' })
    expect(deps.isRunning).toHaveBeenCalledExactlyOnceWith(browser)
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.openExternal).not.toHaveBeenCalled()
  })
  it.each(['chrome', 'brave', 'edge'] as const)('não abre %s quando não pode verificar processos', async (browser) => {
    const { service, deps } = fixture()
    deps.isRunning = vi.fn(async () => { throw new Error('Access denied') })
    expect(await service.openExtensionsPage(browser)).toEqual({ state: 'unknown' })
    expect(deps.launch).not.toHaveBeenCalled()
  })
  it('consulta novamente em cada ação e detecta navegador fechado depois', async () => {
    const { service, deps } = fixture()
    deps.isRunning = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await service.openExtensionsPage('brave')).toEqual({ state: 'already-running' })
    expect(await service.openExtensionsPage('brave')).toEqual({ state: 'launch-requested' })
    expect(deps.launch).toHaveBeenCalledOnce()
  })
  it('duas chamadas concorrentes compartilham a consulta e uma única abertura', async () => {
    const { service, deps } = fixture()
    let finish!: (running: boolean) => void
    deps.isRunning = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const first = service.openExtensionsPage('brave')
    const second = service.openExtensionsPage('brave')
    await vi.waitFor(() => expect(deps.isRunning).toHaveBeenCalledOnce())
    expect(deps.launch).not.toHaveBeenCalled()
    finish(false)
    expect(await Promise.all([first, second])).toEqual([{ state: 'launch-requested' }, { state: 'launch-requested' }])
    expect(deps.launch).toHaveBeenCalledOnce()
  })
  it.each(['chrome', 'brave', 'edge'])('copia apenas a URL interna fixa de %s', async (browser) => {
    const { service, deps } = fixture()
    await service.copyExtensionsUrl(browser)
    expect(deps.copyText).toHaveBeenCalledExactlyOnceWith(browser + '://extensions/')
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.openExternal).not.toHaveBeenCalled()
  })
  it.each([['chrome', 'C:\\Chrome\\chrome.exe', 'chrome://extensions/'], ['brave', 'C:\\Brave\\brave.exe', 'brave://extensions/'], ['edge', 'C:\\Edge\\msedge.exe', 'edge://extensions/']])('abre %s com executável e argumento separados', async (browser, exe, url) => {
    const { service, deps } = fixture()
    expect(await service.openExtensionsPage(browser)).toEqual({ state: 'launch-requested' })
    expect(deps.launch).toHaveBeenCalledWith(exe, [url]); expect(deps.openExternal).not.toHaveBeenCalled()
  })
  it.each(['firefox', 'C:\\evil.exe', 'chrome --x', null, {}, ['chrome'], 'toString'])('recusa valor arbitrário %j', async (value) => {
    const { service, deps } = fixture()
    await expect(service.openExtensionsPage(value)).rejects.toThrow('Navegador não suportado')
    await expect(service.copyExtensionsUrl(value)).rejects.toThrow('Navegador não suportado')
    expect(deps.launch).not.toHaveBeenCalled()
    expect(deps.copyText).not.toHaveBeenCalled()
  })
  it('abre somente a URL oficial e a pasta fixa, copia somente o caminho fixo', async () => {
    const { service, deps } = fixture()
    await service.openEdgeStore(); await service.openFolder(); await service.copyPath()
    expect(deps.openExternal).toHaveBeenCalledWith('https://microsoftedge.microsoft.com/addons/detail/auri/alnngjgmhiebpnjefjmhbhmhfpgoibnh')
    expect(deps.openPath).toHaveBeenCalledWith(deps.folder)
    expect(deps.copyText).toHaveBeenCalledWith(deps.folder)
  })
  it('status não revela executáveis nem alega extensão instalada', async () => {
    const { service } = fixture(); const status = await service.getStatus()
    expect(status).toMatchObject({ embeddedVersion: '0.3.1', embeddedAvailable: true })
    expect(status.browsers.map((browser) => browser.availableAction)).toEqual(['store', 'manual', 'manual'])
    expect(JSON.stringify(status)).not.toMatch(/\.exe|extensionInstalled|folder|path/)
  })
  it('ausência de browsers remove ações e bloqueia abertura', async () => {
    const { service, deps } = fixture(); deps.detect = vi.fn(async () => ({ edge: null, chrome: null, brave: null }))
    expect((await service.getStatus()).browsers.every((b) => !b.installed && b.availableAction === null)).toBe(true)
    await expect(service.openEdgeStore()).rejects.toThrow('não encontrado')
    await expect(service.openExtensionsPage('chrome')).rejects.toThrow('não encontrado')
    expect(deps.launch).not.toHaveBeenCalled()
  })
  it('Embedded corrompido bloqueia folder/copy/manual, preserva loja Edge', async () => {
    const { service, deps } = fixture(); deps.embeddedAvailable = vi.fn(async () => false)
    expect((await service.getStatus()).browsers.map((b) => b.availableAction)).toEqual(['store', null, null])
    await expect(service.openFolder()).rejects.toThrow('não estão disponíveis')
    await expect(service.copyPath()).rejects.toThrow('não estão disponíveis')
    expect(deps.openPath).not.toHaveBeenCalled(); expect(deps.copyText).not.toHaveBeenCalled()
  })
  it.each(['launch', 'openExternal', 'openPath', 'copyText'] as const)('sanitiza falhas de %s', async (method) => {
    const { service, deps } = fixture(); deps[method] = vi.fn(() => { throw new Error('C:\\Users\\private\\secret') })
    const action = { launch: () => service.openExtensionsPage('chrome'), openExternal: () => service.openEdgeStore(), openPath: () => service.openFolder(), copyText: () => service.copyPath() }[method]
    await expect(action()).rejects.toThrow('Não foi possível concluir a ação')
  })
  it('converte erro retornado por shell.openPath em erro sanitizado', async () => {
    const { service, deps } = fixture(); deps.openPath = vi.fn(async () => 'private path')
    await expect(service.openFolder()).rejects.toThrow('Não foi possível')
  })
  it('mantém pasta estável e verifica arquivos reais/hash/extras', async () => {
    expect(embeddedDirectory(true, resolve('resources'), 'unused')).toBe(resolve('resources/browser-extension'))
    expect(await verifyEmbeddedDirectory(resolve('build/generated/browser-extension'))).toBe(true)
    const root = await mkdtemp(join(tmpdir(), 'auri-embedded-')); roots.push(root)
    const folder = join(root, 'extension'); await cp(resolve('build/generated/browser-extension'), folder, { recursive: true })
    await writeFile(join(folder, 'extra.js'), 'extra')
    expect(await verifyEmbeddedDirectory(folder)).toBe(false)
    await rm(join(folder, 'extra.js')); await writeFile(join(folder, 'assets/popup.js'), 'corrupt')
    expect(await verifyEmbeddedDirectory(folder)).toBe(false)
    expect(await verifyEmbeddedDirectory(join(root, 'missing'))).toBe(false)
  })
})
describe('preload mínimo tipado', () => {
  it('expõe somente seis ações específicas e não encaminha paths/URLs extras', async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: undefined })); const api = createBrowserExtensionApi({ invoke })
    expect(Object.keys(api)).toEqual(['getStatus', 'openEdgeStore', 'openExtensionsPage', 'openFolder', 'copyPath', 'copyExtensionsUrl'])
    expect(Object.isFrozen(api)).toBe(true)
    await (api.openFolder as (...args: unknown[]) => Promise<void>)('C:\\arbitrary')
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.openFolder)
    await (api.openEdgeStore as (...args: unknown[]) => Promise<void>)('https://arbitrary')
    expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.openEdgeStore)
    await api.openExtensionsPage('brave'); expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.openExtensionsPage, 'brave')
    await api.copyPath(); expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.copyPath)
    await api.copyExtensionsUrl('brave'); expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.copyExtensionsUrl, 'brave')
    await api.getStatus(); expect(invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.browserExtension.getStatus)
  })
  it('propaga mensagem sanitizada do Main', async () => {
    const api = createBrowserExtensionApi({ invoke: async () => ({ ok: false, error: { message: 'Ação indisponível.' } }) })
    await expect(api.openFolder()).rejects.toThrow('Ação indisponível.')
  })
  it('integra contexto isolado, handlers específicos e spawn sem shell', () => {
    const preload = readFileSync('src/preload/index.ts', 'utf8')
    const handlers = readFileSync('src/main/ipc/register-ipc-handlers.ts', 'utf8')
    const runtime = readFileSync('src/main/services/create-browser-extension-service.ts', 'utf8')
    expect(preload).toContain('browserExtension: createBrowserExtensionApi(ipcRenderer)')
    expect(handlers).toContain('services.browserExtension.openExtensionsPage(request)')
    expect(handlers).toContain('() => services.browserExtension.openFolder()')
    expect(runtime).toContain('shell: false')
    expect(runtime).toContain('spawn(executable, args,')
  })
})
