import { describe, expect, it, vi } from 'vitest'
import { DesktopCommandService } from '@main/services/desktop-command-service'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

describe('DesktopCommandService', () => {
  it('promove temporariamente a janela no Windows antes de encaminhar desktop.openAddWork', () => {
    const calls: string[] = []
    const send = vi.fn()
    const focusApplication = vi.fn(() => calls.push('app.focus'))
    const window = {
      isDestroyed: () => false,
      isMinimized: () => true,
      isVisible: () => false,
      isFocused: vi.fn(() => false),
      isAlwaysOnTop: vi.fn(() => false),
      restore: vi.fn(() => calls.push('restore')),
      show: vi.fn(() => calls.push('show')),
      moveTop: vi.fn(() => calls.push('moveTop')),
      focus: vi.fn(() => calls.push('focus')),
      setAlwaysOnTop: vi.fn((value: boolean) => calls.push(`alwaysOnTop:${value}`)),
      webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send: vi.fn((...args: unknown[]) => { calls.push('send'); send(...args) }), once: vi.fn() }
    }
    const getWindow = vi.fn(() => window)
    const service = new DesktopCommandService(getWindow as never, { focusApplication, platform: 'win32' })
    const draft = { pageUrl: 'https://example.com/obra', canonicalUrl: 'https://example.com/serie', title: 'Obra', coverUrl: 'https://cdn.example.com/capa.jpg', detectedChapter: { value: '37', numericValue: 37, confidence: 'high' as const, source: 'url' as const } }
    service.openAddWork(draft)
    expect(window.show).toHaveBeenCalledOnce(); expect(window.restore).toHaveBeenCalledOnce()
    expect(focusApplication).toHaveBeenCalledOnce()
    expect(window.moveTop).toHaveBeenCalledTimes(2)
    expect(window.focus).toHaveBeenCalledTimes(2)
    expect(window.setAlwaysOnTop.mock.calls).toEqual([[true], [false]])
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.openAddWork, draft)
    expect(calls).toEqual([
      'restore', 'show', 'app.focus', 'moveTop', 'focus',
      'alwaysOnTop:true', 'moveTop', 'focus', 'alwaysOnTop:false', 'send'
    ])
    expect(getWindow).toHaveBeenCalledOnce()
  })

  it('não usa o fallback quando desktop.openAddWork já obteve foco', () => {
    const window = {
      isDestroyed: () => false, isMinimized: () => false, isVisible: () => true,
      isFocused: () => true, isAlwaysOnTop: vi.fn(), restore: vi.fn(), show: vi.fn(),
      moveTop: vi.fn(), focus: vi.fn(), setAlwaysOnTop: vi.fn(),
      webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send: vi.fn(), once: vi.fn() }
    }
    const focusApplication = vi.fn()
    const service = new DesktopCommandService((() => window) as never, { focusApplication, platform: 'win32' })

    service.openAddWork({ pageUrl: 'https://example.com/obra' })

    expect(focusApplication).toHaveBeenCalledOnce()
    expect(window.setAlwaysOnTop).not.toHaveBeenCalled()
    expect(window.webContents.send).toHaveBeenCalledOnce()
  })

  it('restaura always-on-top mesmo quando o foco do fallback falha', () => {
    let focusCalls = 0
    const window = {
      isDestroyed: () => false, isMinimized: () => false, isVisible: () => true,
      isFocused: () => false, isAlwaysOnTop: () => false, restore: vi.fn(), show: vi.fn(),
      moveTop: vi.fn(),
      focus: vi.fn(() => { focusCalls += 1; if (focusCalls === 2) throw new Error('Win32 recusou foco') }),
      setAlwaysOnTop: vi.fn(),
      webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send: vi.fn(), once: vi.fn() }
    }
    const service = new DesktopCommandService((() => window) as never, { platform: 'win32' })

    expect(() => service.openAddWork({ pageUrl: 'https://example.com/obra' })).not.toThrow()

    expect(window.setAlwaysOnTop.mock.calls).toEqual([[true], [false]])
    expect(window.webContents.send).toHaveBeenCalledOnce()
  })

  it('promove e foca uma janela visível sem restaurar ou mostrar novamente', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, isMinimized: () => false, isVisible: () => true, restore: vi.fn(), show: vi.fn(), moveTop: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send, once: vi.fn() } }
    const service = new DesktopCommandService((() => window) as never)
    service.openWork('work-id')
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.moveTop).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.openWork, 'work-id')
  })

  it('notifica mudança sem restaurar ou focar a janela', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, isMinimized: () => true, isVisible: () => false, restore: vi.fn(), show: vi.fn(), moveTop: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send, once: vi.fn() } }
    const service = new DesktopCommandService((() => window) as never)
    const change = { workId: 'work-id', kind: 'progress' as const }

    service.notifyWorkChanged(change)

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.workChanged, change)
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.moveTop).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
