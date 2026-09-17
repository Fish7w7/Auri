import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Work, WorkMergePreview } from '@shared/contracts'
import { WorkMergeDialog, canExecuteMerge, createDefaultMergeChoices, nextMergePrimaryId } from '@renderer/components/work/WorkMergeDialog'

describe('WorkMergeDialog', () => {
  it('abre pela etapa de seleção sem executar a mesclagem', () => {
    const html = renderToStaticMarkup(createElement(WorkMergeDialog, {
      open: true,
      currentWork: work('11111111-1111-4111-8111-111111111111', 'Obra atual'),
      onClose() {},
      onMerged() {}
    }))
    expect(html).toContain('Mesclar obras')
    expect(html).toContain('Obra atual')
    expect(html).toContain('Escolha a outra obra')
    expect(html).toContain('Mesclar obras</span>')
    expect(html).toContain('disabled')
  })

  it('abre diretamente na prévia quando recebe duas Works da Biblioteca', () => {
    const html = renderToStaticMarkup(createElement(WorkMergeDialog, {
      open: true,
      currentWork: work('11111111-1111-4111-8111-111111111111', 'Primeira selecionada'),
      initialOtherWork: work('22222222-2222-4222-8222-222222222222', 'Segunda selecionada'),
      onClose() {},
      onMerged() {}
    }))
    expect(html).toContain('Será mantida')
    expect(html).toContain('Será incorporada')
    expect(html).toContain('Primeira selecionada')
    expect(html).toContain('Segunda selecionada')
    expect(html).not.toContain('Escolha a outra obra')
  })

  it('Trocar inverte Primary e Secondary de forma determinística', () => {
    const primary = '11111111-1111-4111-8111-111111111111'
    const secondary = '22222222-2222-4222-8222-222222222222'
    expect(nextMergePrimaryId(primary, primary, secondary)).toBe(secondary)
    expect(nextMergePrimaryId(secondary, primary, secondary)).toBe(primary)
  })

  it('inicializa cada conflito com o valor da Primary', () => {
    const value = preview()
    expect(createDefaultMergeChoices(value)).toEqual({ progress: value.primary.id, notes: value.primary.id })
  })

  it('bloqueador desabilita confirmação mesmo com todas as escolhas', () => {
    const value = preview()
    const choices = createDefaultMergeChoices(value)
    expect(canExecuteMerge(value, choices)).toBe(true)
    expect(canExecuteMerge({ ...value, blockers: [{ code: 'EXTERNAL_ID_CONFLICT', message: 'IDs diferentes.' }] }, choices)).toBe(false)
  })

  it('decisão ausente mantém a confirmação desabilitada', () => {
    const value = preview()
    expect(canExecuteMerge(value, { progress: value.primary.id })).toBe(false)
    expect(canExecuteMerge(value, createDefaultMergeChoices(value))).toBe(true)
  })
})

function preview(): WorkMergePreview {
  const primary = work('11111111-1111-4111-8111-111111111111', 'Primary')
  const secondary = work('22222222-2222-4222-8222-222222222222', 'Secondary')
  return {
    primary, secondary,
    totals: { sources: 2, aliases: 1, externalRefs: 0, creators: 0, genres: 0, tags: 0, collections: 0, history: 0 },
    aliasesToAdd: ['Secondary'], automaticActions: [], blockers: [], preferredSourceOptions: [], defaultPreferredSourceId: null,
    conflicts: [
      { field: 'progress', label: 'Progresso', primaryValue: 'Capítulo 10', secondaryValue: 'Capítulo 9', defaultWorkId: primary.id },
      { field: 'notes', label: 'Notas', primaryValue: 'A', secondaryValue: 'B', defaultWorkId: primary.id }
    ]
  }
}

function work(id: string, title: string): Work {
  return {
    id, title, normalizedTitle: title.toLocaleLowerCase(), mediaType: 'manhwa', userStatus: 'reading',
    publicationStatus: null, description: null, countryCode: null, startDate: null, endDate: null,
    lastReadChapter: null, lastReadAt: null, rating: null, favorite: false, hiddenFromHome: false,
    notes: null, lastReadNote: null, cover: { type: 'none', sourceUrl: null, customPath: null, updatedAt: null },
    metadataUpdatedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null
  }
}
