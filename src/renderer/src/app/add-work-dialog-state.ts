import type { DesktopAddWorkDraft } from '@shared/contracts'

export type AddWorkDialogState = {
  open: boolean
  draft: DesktopAddWorkDraft | null
}

export type AddWorkDialogAction =
  | { type: 'open-manual' }
  | { type: 'open-external'; draft: DesktopAddWorkDraft }
  | { type: 'close' }

export const INITIAL_ADD_WORK_DIALOG_STATE: AddWorkDialogState = { open: false, draft: null }

export function reduceAddWorkDialogState(_state: AddWorkDialogState, action: AddWorkDialogAction): AddWorkDialogState {
  if (action.type === 'open-external') return { open: true, draft: action.draft }
  if (action.type === 'open-manual') return { open: true, draft: null }
  return INITIAL_ADD_WORK_DIALOG_STATE
}
