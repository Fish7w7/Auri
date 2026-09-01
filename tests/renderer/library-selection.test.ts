import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIBRARY_SELECTION,
  librarySelectionReducer
} from '../../src/renderer/src/lib/library-selection'

describe('seleção da Biblioteca', () => {
  it('mantém IDs selecionados ao trocar a janela virtualizada e a visualização', () => {
    let state = librarySelectionReducer(EMPTY_LIBRARY_SELECTION, { type: 'enter' })
    state = librarySelectionReducer(state, { type: 'toggle', workId: 'work-42' })

    const visibleInGrid = ['work-1', 'work-2']
    expect(visibleInGrid.some((id) => state.selectedIds.has(id))).toBe(false)
    expect(state.selectedIds.has('work-42')).toBe(true)

    const visibleInList = ['work-41', 'work-42', 'work-43']
    expect(visibleInList.filter((id) => state.selectedIds.has(id))).toEqual(['work-42'])
    expect(state.active).toBe(true)
  })

  it('seleciona todo o resultado, limpa e remove somente os IDs informados', () => {
    let state = librarySelectionReducer(EMPTY_LIBRARY_SELECTION, {
      type: 'select-all',
      workIds: ['work-1', 'work-2', 'work-3']
    })
    state = librarySelectionReducer(state, { type: 'remove', workIds: ['work-2'] })
    expect([...state.selectedIds]).toEqual(['work-1', 'work-3'])
    state = librarySelectionReducer(state, { type: 'clear' })
    expect(state.active).toBe(true)
    expect(state.selectedIds.size).toBe(0)
  })

  it('remove da seleção IDs que deixaram o resultado após um refresh', () => {
    let state = librarySelectionReducer(EMPTY_LIBRARY_SELECTION, {
      type: 'select-all',
      workIds: ['work-reading', 'work-still-visible']
    })
    state = librarySelectionReducer(state, { type: 'reconcile', workIds: ['work-still-visible', 'work-new'] })
    expect([...state.selectedIds]).toEqual(['work-still-visible'])
    expect(state.active).toBe(true)
  })
})
