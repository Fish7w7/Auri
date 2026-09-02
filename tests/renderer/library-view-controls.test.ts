import { createElement, type ComponentProps, type MouseEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@renderer/app/app-context'
import { KeyboardShortcutsProvider } from '@renderer/app/keyboard-shortcuts'
import { ToastProvider } from '@renderer/components/ui/Toast'
import type { IconButton } from '@renderer/components/ui/Button'
import { LibraryPage } from '@renderer/pages/LibraryPage'

type IconButtonProps = ComponentProps<typeof IconButton>
const controls = vi.hoisted(() => new Map<string, IconButtonProps>())

vi.mock('@renderer/components/ui/Button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/components/ui/Button')>()
  return {
    ...actual,
    IconButton: (props: IconButtonProps) => {
      if (props.icon === 'grid' || props.icon === 'list') controls.set(props.icon, props)
      return actual.IconButton(props)
    }
  }
})

function libraryContext(): AppContextValue {
  const context: AppContextValue = {
    settings: {
      libraryView: 'grid', librarySort: 'last_read_desc', cardSize: 'medium',
      sidebarCompact: false, closeToTray: false, coverCacheMaxMb: 500,
      backupAutomatic: true, backupFrequency: 'daily', backupRetention: 10, backupDirectory: null
    },
    summary: { total: 0, favorite: 0, byStatus: { want_to_read: 0, reading: 0, paused: 0, waiting: 0, completed: 0, dropped: 0 } },
    updateSettings: vi.fn(async (patch) => { context.settings = { ...context.settings, ...patch } }),
    refreshData: vi.fn(),
    openAddWork: vi.fn()
  }
  return context
}

function renderLibrary(context: AppContextValue) {
  controls.clear()
  return renderToStaticMarkup(createElement(AppContext.Provider, {
    value: context,
    children: createElement(ToastProvider, {
      children: createElement(KeyboardShortcutsProvider, {
        onQuickSearch: vi.fn(), onAddWork: vi.fn(), canAddWork: true,
        children: createElement(LibraryPage, {})
      })
    })
  }))
}

describe('controles Grid/Lista da Biblioteca', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { hash: '#/library' } }))
  afterEach(() => vi.unstubAllGlobals())

  it('anuncia Grid ativo e Lista inativa em um grupo identificado', () => {
    const html = renderLibrary(libraryContext())

    expect(controls.get('grid')?.['aria-pressed']).toBe(true)
    expect(controls.get('list')?.['aria-pressed']).toBe(false)
    expect(html).toContain('role="group" aria-label="Visualização"')
    expect(html).toMatch(/<button[^>]*aria-label="Visualização em grade"[^>]*title="Visualização em grade"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/<button[^>]*aria-label="Visualização em lista"[^>]*title="Visualização em lista"[^>]*aria-pressed="false"/)
  })

  it('atualiza a configuração existente e inverte aria-pressed ao alternar nos dois sentidos', () => {
    const context = libraryContext()
    renderLibrary(context)
    controls.get('list')!.onClick!({} as MouseEvent<HTMLButtonElement>)

    expect(context.updateSettings).toHaveBeenCalledExactlyOnceWith({ libraryView: 'list' })
    renderLibrary(context)
    expect(controls.get('grid')?.['aria-pressed']).toBe(false)
    expect(controls.get('list')?.['aria-pressed']).toBe(true)

    controls.get('grid')!.onClick!({} as MouseEvent<HTMLButtonElement>)
    expect(context.updateSettings).toHaveBeenLastCalledWith({ libraryView: 'grid' })
    renderLibrary(context)
    expect(controls.get('grid')?.['aria-pressed']).toBe(true)
    expect(controls.get('list')?.['aria-pressed']).toBe(false)
  })

  it('preserva botões nativos, labels e interação de teclado sem handlers adicionais', () => {
    renderLibrary(libraryContext())
    for (const [mode, label] of [['grid', 'Visualização em grade'], ['list', 'Visualização em lista']]) {
      expect(controls.get(mode)?.label).toBe(label)
      expect(controls.get(mode)?.role).toBeUndefined()
      expect(controls.get(mode)?.tabIndex).toBeUndefined()
      expect(controls.get(mode)?.onKeyDown).toBeUndefined()
      expect(controls.get(mode)?.disabled).not.toBe(true)
    }
  })
})
