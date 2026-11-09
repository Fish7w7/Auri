import { describe, expect, it } from 'vitest'
import { formatRelativeDate, mapDomainError, MEDIA_TYPE_LABELS, STATUS_LABELS } from '@renderer/lib/format'
import { getVisibleHomeSections } from '@renderer/lib/home-sections'

describe('formatação da interface', () => {
  const now = new Date('2026-08-17T12:00:00.000Z')

  it('formata última leitura de forma estável', () => {
    expect(formatRelativeDate(null, now)).toBe('Nunca lido')
    expect(formatRelativeDate('2026-08-17T08:00:00.000Z', now)).toBe('Hoje')
    expect(formatRelativeDate('2026-08-16T08:00:00.000Z', now)).toBe('Ontem')
    expect(formatRelativeDate('2026-08-10T08:00:00.000Z', now)).toBe('há 7 dias')
    expect(formatRelativeDate('2026-06-17T08:00:00.000Z', now)).toBe('há 2 meses')
  })

  it('mapeia todos os status e tipos reconhecidos', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(6)
    expect(STATUS_LABELS.waiting).toBe('Esperando')
    expect(Object.keys(MEDIA_TYPE_LABELS)).toHaveLength(7)
    expect(MEDIA_TYPE_LABELS.light_novel).toBe('Light Novel')
  })

  it('mantém estados vazios das seções habilitadas e respeita a ordem', () => {
    const sections = getVisibleHomeSections({
      continueReading: [],
      reading: {},
      recent: [{ id: 'work' } as never],
      favorites: [],
      recentlyAdded: [],
      pinnedCollections: []
    }, {
      sectionOrder: ['favorites', 'continueReading', 'recent', 'recentlyAdded'],
      enabledSections: { continueReading: true, recent: true, favorites: true, recentlyAdded: false },
      pinnedCollectionIds: []
    })
    expect(sections.map((section) => section.key)).toEqual(['favorites', 'continueReading', 'recent'])
    expect(sections[0].emptyTitle).toBe('Nenhuma obra favorita para mostrar.')
  })

  it('mostra ausência de conexão local sem expor erro técnico', () => {
    expect(mapDomainError({ error: { code: 'URL_FETCH_FAILED', message: 'fetch failed', details: { offline: true } } }))
      .toBe('Sem conexão com a internet. Verifique sua conexão e tente novamente.')
  })
})
