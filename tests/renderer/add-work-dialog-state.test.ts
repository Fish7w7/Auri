import { describe, expect, it } from 'vitest'
import { INITIAL_ADD_WORK_DIALOG_STATE, reduceAddWorkDialogState } from '@renderer/app/add-work-dialog-state'

describe('lifecycle do draft externo', () => {
  it('descarta o draft no cancelamento e não o reutiliza na abertura manual', () => {
    const external = reduceAddWorkDialogState(INITIAL_ADD_WORK_DIALOG_STATE, {
      type: 'open-external',
      draft: { pageUrl: 'https://example.com/obra', coverUrl: 'https://cdn.example.com/capa.jpg' }
    })
    const closed = reduceAddWorkDialogState(external, { type: 'close' })
    const manual = reduceAddWorkDialogState(closed, { type: 'open-manual' })

    expect(closed).toEqual({ open: false, draft: null })
    expect(manual).toEqual({ open: true, draft: null })
  })

  it('uma solicitação externa nova substitui o draft anterior', () => {
    const first = reduceAddWorkDialogState(INITIAL_ADD_WORK_DIALOG_STATE, {
      type: 'open-external', draft: { pageUrl: 'https://example.com/a', coverUrl: 'https://cdn.example.com/a.jpg' }
    })
    const secondDraft = { pageUrl: 'https://example.com/b', coverUrl: 'https://cdn.example.com/b.jpg' }
    const second = reduceAddWorkDialogState(first, { type: 'open-external', draft: secondDraft })

    expect(second).toEqual({ open: true, draft: secondDraft })
  })
})
