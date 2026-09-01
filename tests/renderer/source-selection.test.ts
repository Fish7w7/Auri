import { describe, expect, it, vi } from 'vitest'
import type { Source } from '@shared/contracts'
import {
  listEligibleReadingSources,
  openReadingSource,
  selectBestReadingSource,
  selectDefaultProgressSource
} from '@renderer/lib/source-selection'

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workId: overrides.workId ?? '00000000-0000-4000-8000-000000000001',
    name: overrides.name ?? null,
    domain: overrides.domain ?? 'reader.example',
    language: overrides.language ?? null,
    seriesUrl: overrides.seriesUrl === undefined ? 'https://reader.example/work' : overrides.seriesUrl,
    lastReadUrl: overrides.lastReadUrl ?? null,
    translatorGroup: overrides.translatorGroup ?? null,
    status: overrides.status ?? 'active',
    isPreferred: overrides.isPreferred ?? false,
    lastUsedAt: overrides.lastUsedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-01T00:00:00.000Z'
  }
}

describe('seleção e abertura de fontes', () => {
  it('prioriza último uso, depois preferência e mantém fallback determinístico', () => {
    const preferred = source({ id: 'preferred', isPreferred: true, createdAt: '2026-08-02T00:00:00.000Z' })
    const lastUsed = source({ id: 'used', lastUsedAt: '2026-08-20T00:00:00.000Z' })
    const archived = source({ id: 'archived', status: 'archived', lastUsedAt: '2026-08-21T00:00:00.000Z' })
    expect(selectBestReadingSource([preferred, archived, lastUsed])?.id).toBe('used')
    expect(selectBestReadingSource([source({ id: 'later', createdAt: '2026-08-03T00:00:00.000Z' }), preferred])?.id).toBe('preferred')
    expect(listEligibleReadingSources([source({ id: 'later', createdAt: '2026-08-03T00:00:00.000Z' }), source({ id: 'earlier' })]).map((item) => item.id)).toEqual(['earlier', 'later'])
  })

  it('não prioriza fonte indisponível no progresso manual', () => {
    const unavailable = source({ id: 'down', status: 'unavailable', lastUsedAt: '2026-08-22T00:00:00.000Z' })
    const preferred = source({ id: 'preferred', isPreferred: true })
    expect(selectDefaultProgressSource([unavailable, preferred])?.id).toBe('preferred')
    expect(selectDefaultProgressSource([unavailable])).toBeNull()
  })

  it('registra uso somente depois que a abertura é aceita e não altera preferência', async () => {
    const current = source({ id: 'source', isPreferred: false })
    const sequence: string[] = []
    const result = await openReadingSource(current, {
      openExternal: async () => { sequence.push('open') },
      markUsed: async () => { sequence.push('mark'); return { ...current, lastUsedAt: '2026-08-28T12:00:00.000Z' } }
    })
    expect(sequence).toEqual(['open', 'mark'])
    expect(result).toMatchObject({ lastUsedAt: '2026-08-28T12:00:00.000Z', isPreferred: false })
  })

  it('não registra uso quando openExternal falha', async () => {
    const markUsed = vi.fn()
    await expect(openReadingSource(source(), {
      openExternal: async () => { throw new Error('falha') },
      markUsed
    })).rejects.toThrow('falha')
    expect(markUsed).not.toHaveBeenCalled()
  })
})
