import { describe, expect, it, vi } from 'vitest'
import { handleFilterPanelKeyDown } from '@renderer/components/library/FilterPanel'
import { closeLibraryFilters, focusLibraryTarget } from '@renderer/lib/library-focus'

function focusRoot(entries: Record<string, { focus(): void } | undefined>) {
  return {
    querySelector<T>(selector: string): T | null {
      return (entries[selector] as T | undefined) ?? null
    }
  }
}

describe('foco do modo de seleção da Biblioteca', () => {
  it('move o foco para Selecionar tudo ao entrar no modo', () => {
    const focus = vi.fn()
    const selector = focusLibraryTarget(focusRoot({
      '[data-library-selection-focus]:not([disabled])': { focus }
    }), 'selection')

    expect(selector).toBe('[data-library-selection-focus]:not([disabled])')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('usa um controle habilitado da toolbar e depois a pesquisa como fallback', () => {
    const toolbarFocus = vi.fn()
    expect(focusLibraryTarget(focusRoot({
      '.bulk-toolbar button:not([disabled])': { focus: toolbarFocus }
    }), 'selection')).toBe('.bulk-toolbar button:not([disabled])')
    expect(toolbarFocus).toHaveBeenCalledOnce()

    const searchFocus = vi.fn()
    expect(focusLibraryTarget(focusRoot({ '#library-search': { focus: searchFocus } }), 'selection')).toBe('#library-search')
    expect(searchFocus).toHaveBeenCalledOnce()
  })

  it('devolve o foco ao botão Selecionar ao sair do modo', () => {
    const focus = vi.fn()
    expect(focusLibraryTarget(focusRoot({
      '[data-library-select-trigger]:not([disabled])': { focus }
    }), 'select-trigger')).toBe('[data-library-select-trigger]:not([disabled])')
    expect(focus).toHaveBeenCalledOnce()
  })
})

describe('fechamento dos filtros', () => {
  it.each(['checkbox', 'input', 'select'])('consome Escape dentro de %s e solicita o fechamento', () => {
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    const onClose = vi.fn()

    expect(handleFilterPanelKeyDown({ key: 'Escape', preventDefault, stopPropagation }, onClose)).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(stopPropagation).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('centraliza o fechamento e devolve o foco ao gatilho', () => {
    const setOpen = vi.fn()
    const focus = vi.fn()
    closeLibraryFilters(setOpen, { focus }, (callback) => callback())

    expect(setOpen).toHaveBeenCalledWith(false)
    expect(focus).toHaveBeenCalledOnce()
  })

  it('não consome outras teclas', () => {
    const event = { key: 'Tab', preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const onClose = vi.fn()
    expect(handleFilterPanelKeyDown(event, onClose)).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})
