import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { launchBrowser } from '@main/services/create-browser-extension-service'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn, execFile: vi.fn() }))
vi.mock('electron', () => ({ clipboard: {}, shell: {} }))
beforeEach(() => spawn.mockReset())

describe('dispatch seguro para a instância normal do navegador', () => {
  it.each([['brave', 'brave.exe'], ['chrome', 'chrome.exe'], ['edge', 'msedge.exe']])('%s recebe só a URL explícita, sem flags ou shell', async (browser, executable) => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    spawn.mockReturnValue(child)
    const request = launchBrowser(executable, [browser + '://extensions/'])
    expect(spawn).toHaveBeenCalledExactlyOnceWith(executable, [browser + '://extensions/'], { shell: false, detached: true, stdio: 'ignore', windowsHide: false })
    let dispatched = false
    void request.then(() => { dispatched = true })
    await Promise.resolve()
    expect(dispatched).toBe(false)
    child.emit('spawn')
    await request
    expect(child.unref).toHaveBeenCalledOnce()
  })
  it('rejeita erro de criação do processo para permitir recuperação', async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    spawn.mockReturnValue(child)
    const request = launchBrowser('brave.exe', ['brave://extensions/'])
    const rejection = expect(request).rejects.toThrow('ENOENT')
    child.emit('error', new Error('ENOENT'))
    await rejection
    expect(child.unref).not.toHaveBeenCalled()
  })
})
