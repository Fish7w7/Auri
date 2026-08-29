import { describe, expect, it, vi } from 'vitest'
import { ANILIST_REQUEST_TIMEOUT_MS, AniListClient } from '@main/services/metadata/providers/anilist/anilist-client'
import { mapAniListDetails, mapAniListMediaType, sanitizeExternalDescription } from '@main/services/metadata/providers/anilist/mapper'
import type { GraphqlTransport } from '@main/services/metadata/types'
import type { AniListDetailedMedia } from '@main/services/metadata/providers/anilist/schemas'
import { DETAILS_QUERY } from '@main/services/metadata/providers/anilist/queries'

const media: AniListDetailedMedia = {
  id: 42, title: { english: null, romaji: 'Nano Machine', native: '나노마신' }, format: 'MANGA', status: 'RELEASING',
  startDate: { year: 2020, month: 6, day: null }, endDate: { year: null, month: null, day: null }, countryOfOrigin: 'KR',
  coverImage: { large: 'https://img.example/large.jpg', extraLarge: 'https://img.example/cover.jpg' }, siteUrl: 'https://anilist.co/manga/42',
  synonyms: ['Nano Mashin', 'Nano Machine'], description: '<b>Um guerreiro</b><br>com &amp; tecnologia.', genres: ['Action', ' Action ', 'Fantasy'],
  staff: { edges: [{ role: 'Story', node: { name: { full: 'Han Joong Wue' } } }, { role: 'Art', node: { name: { full: 'Geum Gang Bul Gae' } } }, { role: 'Voice Actor', node: { name: { full: 'Ignorado' } } }] }
}

describe('mapper do AniList', () => {
  it('preserva precisão de data, usa fallback de título e não inventa webtoon', () => {
    const mapped = mapAniListDetails(media)!
    expect(mapped.title).toBe('Nano Machine')
    expect(mapped.startDate).toBe('2020-06')
    expect(mapped.mediaType).toBe('manhwa')
    expect(mapped.countryCode).toBe('KR')
    expect(mapped.publicationStatus).toBe('ongoing')
    expect(mapped.coverUrl).toBe('https://img.example/cover.jpg')
    expect(mapped.canonicalUrl).toBe('https://anilist.co/manga/42')
    expect(mapped.aliases.map((item) => item.name)).toEqual(['나노마신', 'Nano Mashin'])
    expect(mapped.creators).toEqual([{ name: 'Han Joong Wue', role: 'author' }, { name: 'Geum Gang Bul Gae', role: 'artist' }])
    expect(mapped.genres).toEqual(['Action', 'Fantasy'])
  })
  it('sanitiza HTML externo e rejeita formatos sem equivalência', () => {
    expect(sanitizeExternalDescription('<script>x</script><b>Texto</b> &amp; valor')).toBe('xTexto & valor')
    expect(mapAniListMediaType('MANGA', 'JP')).toBe('manga')
    expect(mapAniListMediaType('TV', 'JP')).toBeNull()
  })
  it('usa título nativo quando english e romaji estão ausentes', () => {
    expect(mapAniListDetails({ ...media, title: { english: null, romaji: null, native: '原作' } })?.title).toBe('原作')
  })
  it('importa synonyms distintos e elimina vazios e duplicatas normalizadas', () => {
    const shepherd = mapAniListDetails({
      ...media,
      title: { english: 'The Shepherd Wizard', romaji: 'Yangchigi Mabeopsa', native: '양치기 마법사' },
      synonyms: ['Shepherd Mage', ' ', 'the  shepherd wizard', 'YANGCHIGI MABEOPSA', 'Shepherd Mage']
    })!
    expect(DETAILS_QUERY).toContain('synonyms')
    expect(shepherd.title).toBe('The Shepherd Wizard')
    expect(shepherd.aliases).toEqual([
      { name: 'Yangchigi Mabeopsa', kind: 'romaji' },
      { name: '양치기 마법사', kind: 'native' },
      { name: 'Shepherd Mage', kind: 'synonym' }
    ])
  })
})

describe('AniListClient', () => {
  const transport = (overrides: Partial<GraphqlTransport> = {}): GraphqlTransport => ({ isOnline: () => true, post: async () => ({ status: 200, headers: {}, json: async () => ({ data: { ok: true } }) }), ...overrides })
  it('retorna somente data de uma resposta GraphQL válida', async () => {
    await expect(new AniListClient(transport()).query('query', {})).resolves.toEqual({ ok: true })
  })
  it('falha de modo explícito offline', async () => {
    await expect(new AniListClient(transport({ isOnline: () => false })).query('query', {})).rejects.toMatchObject({ code: 'METADATA_PROVIDER_UNAVAILABLE' })
  })
  it('respeita Retry-After e bloqueia nova chamada localmente', async () => {
    let calls = 0
    const client = new AniListClient(transport({ post: async () => { calls += 1; return { status: 429, headers: { 'retry-after': '30' }, json: async () => ({}) } } }), () => 1000)
    await expect(client.query('query', {})).rejects.toMatchObject({ code: 'METADATA_RATE_LIMITED' })
    await expect(client.query('query', {})).rejects.toMatchObject({ code: 'METADATA_RATE_LIMITED' })
    expect(calls).toBe(1)
  })
  it('rejeita JSON sem data', async () => {
    await expect(new AniListClient(transport({ post: async () => ({ status: 200, headers: {}, json: async () => ({}) }) })).query('query', {})).rejects.toMatchObject({ code: 'METADATA_INVALID_RESPONSE' })
  })
  it('aborta ao atingir o prazo absoluto e permite uma tentativa posterior', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      let firstSignal: AbortSignal | undefined
      const client = new AniListClient(transport({
        post: async (_url, _body, signal) => {
          calls += 1
          if (calls === 1) {
            firstSignal = signal
            return new Promise(() => undefined)
          }
          return { status: 200, headers: {}, json: async () => ({ data: { recovered: true } }) }
        }
      }))
      const timedOut = client.query('query', {})
      const timedOutExpectation = expect(timedOut).rejects.toMatchObject({ code: 'METADATA_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(ANILIST_REQUEST_TIMEOUT_MS)
      await timedOutExpectation
      expect(firstSignal?.aborted).toBe(true)
      await expect(client.query('query', {})).resolves.toEqual({ recovered: true })
      expect(calls).toBe(2)
    } finally { vi.useRealTimers() }
  })
  it('aborta cancelamento esperado com erro de domínio amigável', async () => {
    const controller = new AbortController()
    let transportSignal: AbortSignal | undefined
    const client = new AniListClient(transport({ post: async (_url, _body, signal) => {
      transportSignal = signal
      return new Promise(() => undefined)
    } }))
    const pending = client.query('query', {}, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'METADATA_REQUEST_CANCELLED' })
    expect(transportSignal?.aborted).toBe(true)
  })
})
