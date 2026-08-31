import { describe, expect, it } from 'vitest'
import { createExternalDraftForm } from '@renderer/components/work/AddWorkDialog'

describe('draft externo do AddWorkDialog', () => {
  it('preenche somente os campos recebidos e não marca fonte como preferida', () => {
    const form = createExternalDraftForm({ pageUrl: 'https://site.example/chapter/4', canonicalUrl: 'https://site.example/series/a', title: 'Obra A', sourceName: 'Site', detectedChapter: { value: '4', numericValue: 4, confidence: 'high', source: 'url' } })
    expect(form).toMatchObject({ title: 'Obra A', chapter: '4', sourceName: 'Site', sourceUrl: 'https://site.example/series/a', sourcePreferred: false })
  })
})
