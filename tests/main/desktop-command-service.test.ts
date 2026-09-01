import { describe, expect, it, vi } from 'vitest'
import { DesktopCommandService } from '@main/services/desktop-command-service'
import { IPC_CHANNELS } from '@shared/constants/ipc-channels'

describe('DesktopCommandService', () => {
  it('restaura, mostra e foca a janela existente sem criar outra', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send, once: vi.fn() } }
    const getWindow = vi.fn(() => window)
    const service = new DesktopCommandService(getWindow as never)
    service.openWork('work-id')
    expect(window.show).toHaveBeenCalledOnce(); expect(window.restore).toHaveBeenCalledOnce(); expect(window.focus).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.openWork, 'work-id')
    expect(getWindow).toHaveBeenCalledOnce()
  })

  it('envia o draft com coverUrl ao Renderer sem criar obra', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send, once: vi.fn() } }
    const service = new DesktopCommandService((() => window) as never)
    const draft = { pageUrl: 'https://example.com/obra', title: 'Obra', coverUrl: 'https://cdn.example.com/capa.jpg' }
    service.openAddWork(draft)
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.openAddWork, draft)
  })

  it('notifica mudança sem restaurar ou focar a janela', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, isLoadingMainFrame: () => false, send, once: vi.fn() } }
    const service = new DesktopCommandService((() => window) as never)
    const change = { workId: 'work-id', kind: 'progress' as const }

    service.notifyWorkChanged(change)

    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.desktopCommands.workChanged, change)
    expect(window.restore).not.toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})
