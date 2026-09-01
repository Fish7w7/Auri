import { describe, expect, it, vi } from 'vitest'
import { getQuickSearchPhase } from '@renderer/components/library/QuickSearchDialog'
import { isImportReviewDirty } from '@renderer/components/work/AddWorkDialog'
import { applyEditorCoverChange } from '@renderer/components/work/WorkEditorDialog'
import { EMPTY_WORK_FORM } from '@renderer/components/work/WorkForm'

describe('completude funcional do desktop', () => {
  it('distingue falha técnica de busca válida sem resultados', () => {
    expect(getQuickSearchPhase('ausente', false, 0, false)).toBe('empty')
    expect(getQuickSearchPhase('ausente', false, 0, true)).toBe('error')
  })

  it('considera alterações da revisão de importação como dirty', () => {
    const initial = { title: 'Obra', mediaType: 'manga' as const, userStatus: 'want_to_read' as const, chapter: '', sourceName: '', sourceUrl: '', lastReadNote: '', allowProbable: false }
    expect(isImportReviewDirty(initial, initial)).toBe(false)
    expect(isImportReviewDirty({ ...initial, title: 'Título revisado' }, initial)).toBe(true)
  })

  it('não considera capa personalizada aplicada quando o seletor é cancelado', async () => {
    const assets = { removeCover: vi.fn(), setRemoteCover: vi.fn(), selectCover: vi.fn().mockResolvedValue(null) }
    const result = await applyEditorCoverChange('00000000-0000-4000-8000-000000000001', { ...EMPTY_WORK_FORM, coverMode: 'custom' }, EMPTY_WORK_FORM, assets)
    expect(result).toBe('cancelled')
    expect(assets.selectCover).toHaveBeenCalledOnce()
  })
})
