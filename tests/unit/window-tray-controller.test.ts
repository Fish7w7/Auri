import { describe, expect, it, vi } from 'vitest'
import {
  restoreMainWindow,
  WindowTrayController,
  type ManagedMainWindow,
  type PreventableCloseEvent,
  type TrayActions
} from '@main/windows/window-tray-controller'

class FakeWindow implements ManagedMainWindow {
  private closeListeners: Array<(event: PreventableCloseEvent) => void> = []
  private sessionEndListeners: Array<() => void> = []
  destroyed = false
  minimized = false
  visible = true
  hidden = 0
  shown = 0
  restored = 0
  focused = 0

  on(event: 'close', listener: (event: PreventableCloseEvent) => void): void
  on(event: 'query-session-end', listener: () => void): void
  on(event: 'close' | 'query-session-end', listener: ((event: PreventableCloseEvent) => void) | (() => void)): void {
    if (event === 'close') this.closeListeners.push(listener as (event: PreventableCloseEvent) => void)
    else this.sessionEndListeners.push(listener as () => void)
  }

  emitClose(): boolean {
    let prevented = false
    for (const listener of this.closeListeners) listener({ preventDefault: () => { prevented = true } })
    return prevented
  }

  emitSessionEnd(): void { for (const listener of this.sessionEndListeners) listener() }
  isDestroyed(): boolean { return this.destroyed }
  isMinimized(): boolean { return this.minimized }
  restore(): void { this.minimized = false; this.restored += 1 }
  show(): void { this.visible = true; this.shown += 1 }
  focus(): void { this.focused += 1 }
  hide(): void { this.visible = false; this.hidden += 1 }
}

function createFixture(initialEnabled = false) {
  const window = new FakeWindow()
  const listeners = new Set<(enabled: boolean) => void>()
  const trays: Array<{ actions: TrayActions; destroy: ReturnType<typeof vi.fn> }> = []
  const quitApplication = vi.fn()
  let enabled = initialEnabled
  const controller = new WindowTrayController({
    window,
    getCloseToTray: () => enabled,
    onCloseToTrayChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    createTray: (actions) => {
      const tray = { actions, destroy: vi.fn() }
      trays.push(tray)
      return tray
    },
    quitApplication
  })
  return {
    controller, window, trays, quitApplication,
    setEnabled(next: boolean) { enabled = next; for (const listener of listeners) listener(next) }
  }
}

describe('WindowTrayController', () => {
  it('mantém o fechamento normal quando closeToTray está desativado', () => {
    const fixture = createFixture()

    expect(fixture.window.emitClose()).toBe(false)
    expect(fixture.window.hidden).toBe(0)
    expect(fixture.trays).toHaveLength(0)
  })

  it('cria um único Tray, esconde no close e o destrói ao desativar', () => {
    const fixture = createFixture()

    fixture.setEnabled(true)
    fixture.setEnabled(true)
    expect(fixture.trays).toHaveLength(1)
    expect(fixture.window.emitClose()).toBe(true)
    expect(fixture.window.hidden).toBe(1)

    fixture.setEnabled(false)
    expect(fixture.trays[0].destroy).toHaveBeenCalledOnce()
    expect(fixture.window.emitClose()).toBe(false)
  })

  it('restaura, mostra e foca a mesma janela pelo clique ou ação Abrir', () => {
    const fixture = createFixture(true)
    fixture.window.visible = false
    fixture.window.minimized = true

    fixture.trays[0].actions.open()

    expect(fixture.window.shown).toBe(1)
    expect(fixture.window.restored).toBe(1)
    expect(fixture.window.focused).toBe(1)
    expect(fixture.window.visible).toBe(true)
  })

  it('Sair encerra de verdade e não converte o close posterior em hide', () => {
    const fixture = createFixture(true)

    fixture.trays[0].actions.quit()

    expect(fixture.quitApplication).toHaveBeenCalledOnce()
    expect(fixture.trays[0].destroy).toHaveBeenCalledOnce()
    expect(fixture.window.emitClose()).toBe(false)
    expect(fixture.window.hidden).toBe(0)
  })

  it('não intercepta encerramento da sessão nem quit real do updater', () => {
    const session = createFixture(true)
    session.window.emitSessionEnd()
    expect(session.window.emitClose()).toBe(false)

    const updater = createFixture(true)
    updater.controller.beginQuit()
    expect(updater.window.emitClose()).toBe(false)
    expect(updater.trays[0].destroy).toHaveBeenCalledOnce()
  })

  it('restaura a janela escondida quando uma segunda instância é aberta', () => {
    const window = new FakeWindow()
    window.visible = false
    window.minimized = true

    restoreMainWindow(window)

    expect(window.visible).toBe(true)
    expect(window.restored).toBe(1)
    expect(window.focused).toBe(1)
  })
})
