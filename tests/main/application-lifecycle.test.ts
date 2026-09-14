import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainProcessEnvironment } from '@main/application/environment'

const runtime = vi.hoisted(() => ({
  start: vi.fn(async () => undefined),
  activate: vi.fn(),
  handleSecondInstance: vi.fn(),
  dispose: vi.fn()
}))

vi.mock('@main/application/bootstrap', () => ({
  MainProcessRuntime: class {
    start = runtime.start
    activate = runtime.activate
    handleSecondInstance = runtime.handleSecondInstance
    dispose = runtime.dispose
  }
}))

import { registerApplicationLifecycle } from '@main/application/lifecycle'

const environment = { isAutomatedRuntime: false } as MainProcessEnvironment

beforeEach(() => vi.clearAllMocks())

describe('lifecycle do processo principal', () => {
  it('encerra imediatamente quando outra instância possui o lock', () => {
    const app = createApp(false)
    registerApplicationLifecycle(app.value as never, environment)
    expect(app.quit).toHaveBeenCalledOnce()
    expect(app.on).not.toHaveBeenCalled()
    expect(runtime.start).not.toHaveBeenCalled()
  })

  it('registra cada listener uma vez e delega ao runtime proprietário', async () => {
    const app = createApp(true)
    registerApplicationLifecycle(app.value as never, environment)
    await vi.waitFor(() => expect(runtime.start).toHaveBeenCalledOnce())

    expect([...app.listeners.keys()]).toEqual(['second-instance', 'before-quit', 'window-all-closed', 'activate'])
    app.listeners.get('second-instance')?.({}, ['Auri.exe'])
    app.listeners.get('activate')?.()
    app.listeners.get('before-quit')?.()

    expect(runtime.handleSecondInstance).toHaveBeenCalledWith(['Auri.exe'])
    expect(runtime.activate).toHaveBeenCalledOnce()
    expect(runtime.dispose).toHaveBeenCalledOnce()
  })
})

function createApp(hasLock: boolean) {
  const listeners = new Map<string, (...argumentsList: unknown[]) => void>()
  const quit = vi.fn()
  const on = vi.fn((event: string, listener: (...argumentsList: unknown[]) => void) => {
    listeners.set(event, listener)
  })
  return {
    value: {
      requestSingleInstanceLock: () => hasLock,
      quit,
      on,
      whenReady: () => Promise.resolve()
    },
    listeners,
    quit,
    on
  }
}
