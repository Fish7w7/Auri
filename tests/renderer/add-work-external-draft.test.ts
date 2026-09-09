import { describe, expect, it } from 'vitest'
import { createExternalDraftForm, duplicateSourceNotice } from '@renderer/components/work/AddWorkDialog'

describe('draft externo do AddWorkDialog', () => {
  it('sem coverUrl preserva o formulário anterior', () => {
    const form = createExternalDraftForm({ pageUrl: 'https://site.example/series/a/4', canonicalUrl: 'https://site.example/series/a', title: 'Obra A', sourceName: 'Site', detectedChapter: { value: '4', numericValue: 4, confidence: 'high', source: 'url' } })
    expect(form).toMatchObject({ title: 'Obra A', chapter: '4', sourceName: 'Site', sourceUrl: 'https://site.example/series/a', sourceLastUrl: 'https://site.example/series/a/4', sourcePreferred: false, coverMode: 'none', coverUrl: '' })
  })

  it('deriva a identidade da série quando canonical aponta para o capítulo', () => {
    const form = createExternalDraftForm({
      pageUrl: 'https://site.example/series/a/37',
      canonicalUrl: 'https://site.example/series/a/37',
      detectedChapter: { value: '37', numericValue: 37, confidence: 'high', source: 'url' }
    })
    expect(form).toMatchObject({
      sourceUrl: 'https://site.example/series/a',
      sourceLastUrl: 'https://site.example/series/a/37'
    })
  })

  it('com coverUrl seleciona capa remota e preenche a URL', () => {
    const form = createExternalDraftForm({
      pageUrl: 'https://site.example/series/a',
      title: 'Obra A',
      coverUrl: 'https://cdn.site.example/covers/a.webp'
    })
    expect(form).toMatchObject({ coverMode: 'remote', coverUrl: 'https://cdn.site.example/covers/a.webp' })
  })

  it('extrai a obra existente para a ação de abrir após bloqueio de duplicata', () => {
    expect(duplicateSourceNotice({ error: {
      code: 'DUPLICATE_SOURCE',
      details: { workId: 'work-id', workTitle: 'A Transmissão do Super-Humano' }
    } })).toEqual({ workId: 'work-id', workTitle: 'A Transmissão do Super-Humano' })
    expect(duplicateSourceNotice({ error: { code: 'INVALID_INPUT' } })).toBeNull()
  })
})
