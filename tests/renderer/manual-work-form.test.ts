import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createManualWorkRequest, isManualWorkValid } from '@renderer/components/work/AddWorkDialog'
import { EMPTY_WORK_FORM, ProgressiveWorkForm } from '@renderer/components/work/WorkForm'

describe('cadastro manual progressivo', () => {
  it('começa compacto e mantém somente o título como obrigatório', () => {
    const html = renderToStaticMarkup(createElement(ProgressiveWorkForm, {
      value: EMPTY_WORK_FORM,
      onChange() {},
      collections: [],
      includeProgress: true,
      includeSource: true,
      includeCover: true
    }))

    expect(html).toContain('Essencial')
    expect(html).toContain('Somente o título é obrigatório. Você pode completar o restante depois.')
    expect(html).toContain('+ Mais informações')
    expect(html).not.toContain('Leitura e fonte')
    expect(html).not.toContain('Nota pessoal (0–10)')
    expect(isManualWorkValid({ title: '   ' })).toBe(false)
    expect(isManualWorkValid({ title: 'Obra' })).toBe(true)
  })

  it('submete dados essenciais ou opcionais preservados no mesmo estado', () => {
    const essential = createManualWorkRequest({ ...EMPTY_WORK_FORM, title: 'Obra essencial' })
    expect(essential).toMatchObject({
      title: 'Obra essencial',
      mediaType: 'manhwa',
      userStatus: 'reading',
      chapter: null,
      rating: null,
      favorite: false,
      aliases: [],
      creators: [],
      genres: [],
      tags: [],
      collectionIds: []
    })
    expect(essential.source).toBeUndefined()
    expect(essential.cover).toBeUndefined()

    const complete = createManualWorkRequest({
      ...EMPTY_WORK_FORM,
      title: 'Obra completa',
      chapter: '42',
      rating: '8.5',
      aliases: [{ name: 'Outro título', kind: 'alternative' }],
      creators: [{ name: 'Autora', role: 'author' }],
      genres: 'Fantasia, Ação',
      tags: ['Favorita da temporada'],
      collectionIds: ['colecao-1'],
      sourceName: 'Fonte',
      sourceUrl: 'https://example.com/obra',
      sourcePreferred: true,
      coverMode: 'remote',
      coverUrl: 'https://example.com/capa.jpg'
    })

    expect(complete).toMatchObject({
      chapter: '42',
      rating: 8.5,
      aliases: [{ name: 'Outro título', kind: 'alternative', source: 'user' }],
      creators: [{ name: 'Autora', role: 'author', source: 'user' }],
      genres: ['Fantasia', 'Ação'],
      tags: ['Favorita da temporada'],
      collectionIds: ['colecao-1'],
      source: { name: 'Fonte', seriesUrl: 'https://example.com/obra', isPreferred: true },
      cover: { type: 'remote', sourceUrl: 'https://example.com/capa.jpg', customPath: null }
    })
  })
})