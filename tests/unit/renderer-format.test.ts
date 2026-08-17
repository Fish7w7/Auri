import { describe, expect, it } from 'vitest'
import { formatRelativeDate, MEDIA_TYPE_LABELS, STATUS_LABELS } from '@renderer/lib/format'
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

  it('oculta seções vazias da Home', () => {
    const sections = getVisibleHomeSections({
      continueReading: [],
      staleReading: [],
      waiting: [{ id: 'work' } as never],
      recentlyAdded: []
    })
    expect(sections.map((section) => section.key)).toEqual(['waiting'])
  })
})

