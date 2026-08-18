export interface LibrarySelectionState {
  active: boolean
  selectedIds: ReadonlySet<string>
}

export type LibrarySelectionAction =
  | { type: 'enter' }
  | { type: 'exit' }
  | { type: 'clear' }
  | { type: 'toggle'; workId: string }
  | { type: 'select-all'; workIds: string[] }
  | { type: 'remove'; workIds: string[] }

export const EMPTY_LIBRARY_SELECTION: LibrarySelectionState = {
  active: false,
  selectedIds: new Set<string>()
}

export function librarySelectionReducer(
  state: LibrarySelectionState,
  action: LibrarySelectionAction
): LibrarySelectionState {
  switch (action.type) {
    case 'enter':
      return { active: true, selectedIds: new Set<string>() }
    case 'exit':
      return EMPTY_LIBRARY_SELECTION
    case 'clear':
      return { ...state, selectedIds: new Set<string>() }
    case 'toggle': {
      const selectedIds = new Set(state.selectedIds)
      if (selectedIds.has(action.workId)) selectedIds.delete(action.workId)
      else selectedIds.add(action.workId)
      return { active: true, selectedIds }
    }
    case 'select-all':
      return { active: true, selectedIds: new Set(action.workIds) }
    case 'remove': {
      const selectedIds = new Set(state.selectedIds)
      for (const workId of action.workIds) selectedIds.delete(workId)
      return { ...state, selectedIds }
    }
  }
}
