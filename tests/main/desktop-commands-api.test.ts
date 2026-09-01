import { describe, expect, it, vi } from 'vitest'
import { createDesktopCommandsApi } from '../../src/preload/api/desktop-commands-api'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

describe('DesktopCommandsApi', () => {
  it('encaminha workChanged e remove exatamente o listener registrado', () => {
    let registered: ((event: unknown, change: unknown) => void) | undefined
    const ipc = {
      on: vi.fn((_channel, listener) => { registered = listener }),
      removeListener: vi.fn()
    }
    const listener = vi.fn()
    const remove = createDesktopCommandsApi(ipc as never).onWorkChanged(listener)
    const change = { workId: 'work-id', kind: 'progress' as const }

    registered?.({}, change)
    expect(listener).toHaveBeenCalledWith(change)
    remove()
    expect(ipc.on).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.workChanged, registered)
    expect(ipc.removeListener).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.workChanged, registered)
  })
})
