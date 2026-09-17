import { describe, expect, it, vi } from 'vitest'
import { registerIpcHandlers, type IpcServices } from '@main/ipc/register-ipc-handlers'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'
import { BrowserExtensionService } from '@main/services/browser-extension-service'
import { TestLogger } from '../fixtures/test-logger'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler), removeHandler: (name: string) => handlers.delete(name) }, BrowserWindow: {}, clipboard: {}, dialog: {}, shell: {} }))

describe('IPC real registra somente operações específicas', () => {
  it('rejeita browser arbitrário no Main e não aceita caminho/URL do Renderer', async () => {
    expect(readFileSync('src/main/app/create-app-context.ts', 'utf8')).toContain('browserExtension: createBrowserExtensionService(app)')
    expect(readFileSync('src/main/application/bootstrap.ts', 'utf8')).toContain('this.context.services')
    const openPath = vi.fn(async () => '')
    const openExternal = vi.fn(async () => {})
    const isRunning = vi.fn(async () => true)
    const launch = vi.fn(async () => {})
    const service = new BrowserExtensionService({ folder: resolve('build/generated/browser-extension'), detect: async () => ({ edge: 'C:\\msedge.exe', chrome: null, brave: null }), isRunning, embeddedAvailable: async () => true, launch, openPath, openExternal, copyText: vi.fn() })
    const unregister = registerIpcHandlers({ browserExtension: service } as IpcServices, new TestLogger())
    const channels = IPC_CHANNELS.browserExtension
    const invoke = (channel: string, request?: unknown) => handlers.get(channel)!({}, request)
    expect(await invoke(channels.openExtensionsPage, 'chrome --evil')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await invoke(channels.openExtensionsPage, 'edge')).toEqual({ ok: true, data: { state: 'already-running' } })
    expect(launch).not.toHaveBeenCalled()
    isRunning.mockResolvedValueOnce(false)
    expect(await invoke(channels.openExtensionsPage, 'edge')).toEqual({ ok: true, data: { state: 'launch-requested' } })
    expect(launch).toHaveBeenCalledOnce()
    expect(await invoke(channels.copyExtensionsUrl, 'brave://extensions/')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await invoke(channels.copyExtensionsUrl, { browser: 'brave', text: 'arbitrary' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(await invoke(channels.copyExtensionsUrl, 'brave')).toEqual({ ok: true, data: undefined })
    expect(await invoke(channels.openFolder, { path: 'C:\\secret' })).toEqual({ ok: true, data: undefined })
    expect(openPath).toHaveBeenCalledWith(resolve('build/generated/browser-extension'))
    await invoke(channels.openEdgeStore, { url: 'https://evil.example' })
    expect(openExternal).toHaveBeenCalledWith('https://microsoftedge.microsoft.com/addons/detail/auri/alnngjgmhiebpnjefjmhbhmhfpgoibnh')
    expect(await invoke(channels.getStatus)).toMatchObject({ ok: true, data: { embeddedVersion: '0.3.0' } })
    unregister()
    for (const channel of Object.values(channels)) expect(handlers.has(channel)).toBe(false)
  })
})
