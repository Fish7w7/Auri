import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkResolutionRepository } from '@main/database/repositories/work-resolution-repository'
import { WorkResolutionService } from '@main/services/work-resolution-service'
import { workResolveResultSchema } from '@auri/protocol'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })
function setup() {
  const fixture = createDomainFixture(); fixtures.push(fixture)
  const resolution = new WorkResolutionService(new WorkResolutionRepository(fixture.db), fixture.services.sourceIdentity, fixture.services.workEquivalence)
  return { ...fixture, resolution }
}
const dragon = 'Me Casei Com o Dragão Que Matei'
const demon = 'Me Casei Com o Demônio Que Matei'
const draft = { title: demon, mediaType: 'manhwa', userStatus: 'reading', chapter: '14' } as const

describe('revisão conservadora de novas obras — fixtures exclusivamente em memória', () => {
  it('um único possible não vira matched e respeita o contrato Protocol 0.2', () => {
    const fixture = setup()
    createMinimalWork(fixture, dragon, '20')
    const result = fixture.resolution.resolve({ url: 'https://other.example/demon/14', title: demon })
    expect(result).toEqual({ status: 'not_found' })
    expect(workResolveResultSchema.safeParse(result).success).toBe(true)
    const exact = fixture.resolution.resolve({ url: 'https://other.example/dragon', title: dragon })
    expect(exact.status).toBe('matched')
    if (exact.status !== 'matched') throw new Error('Expected exact synthetic match')
    const { status: _status, ...candidate } = exact
    expect(workResolveResultSchema.safeParse({ status: 'ambiguous', candidates: [candidate] }).success).toBe(false)
  })

  it('oferece revisão para tokens parciais, sem vincular por título ou suposta aparência da capa', () => {
    const fixture = setup()
    const existing = fixture.services.works.createWork({ title: dragon, mediaType: 'manhwa', userStatus: 'reading', chapter: '20', cover: { type: 'remote', sourceUrl: 'https://covers.example/dragon.jpg' } })
    const input = { ...draft, cover: { type: 'remote', sourceUrl: 'https://covers.example/demon.jpg' }, source: { seriesUrl: 'https://other.example/demon/14' } }
    // Different URLs could show identical images; no image is loaded or compared.
    expect(fixture.services.details.previewCreate(input)).toMatchObject({
      canKeepSeparate: true,
      candidates: [{ work: { id: existing.id, lastReadChapter: { label: '20' } }, canAddSource: false, reasons: ['fuzzy_title'] }]
    })
    expect(fixture.repositories.sources.listByWork(existing.id)).toHaveLength(0)
  })

  it('exige manter separada explicitamente e preserva 20/14, fontes e histórico em obras distintas', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    const before = fixture.repositories.history.listByWork(existing.id)
    expect(() => fixture.services.works.createWork(draft)).toThrowError(expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }))
    expect(fixture.services.library.getSummary().total).toBe(1)
    const separate = fixture.services.details.createDetailed({ ...draft, reviewedWorkIds: [existing.id], source: { seriesUrl: 'https://other.example/demon/14' } })
    expect(separate.work.lastReadChapter?.label).toBe('14')
    expect(separate.sources).toHaveLength(1)
    expect(fixture.repositories.works.findById(existing.id)?.lastReadChapter?.label).toBe('20')
    expect(fixture.repositories.history.listByWork(existing.id)).toEqual(before)
    expect(fixture.repositories.history.listByWork(separate.work.id)).toHaveLength(1)
    expect(fixture.services.library.getSummary().total).toBe(2)
  })

  it('ID externo compartilhado impede duplicata mesmo após confirmação e permite fonte explícita', () => {
    const fixture = setup()
    const existing = fixture.services.works.createWork({ title: dragon, mediaType: 'manhwa', userStatus: 'reading', chapter: '20', externalRefs: [{ provider: 'anilist', externalId: '101' }] })
    const input = { ...draft, externalRefs: [{ provider: 'anilist', externalId: '101' }], source: { seriesUrl: 'https://other.example/demon/14', isPreferred: true } }
    const before = fixture.repositories.history.listByWork(existing.id)
    expect(fixture.services.details.previewCreate(input)).toMatchObject({ canKeepSeparate: false, candidates: [{ canAddSource: true }] })
    expect(() => fixture.services.details.createDetailed({ ...input, reviewedWorkIds: [existing.id] })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_EXTERNAL_REF' }))
    expect(fixture.repositories.sources.listByWork(existing.id)).toHaveLength(0)
    const source = fixture.services.details.addReviewedSource({ workId: existing.id, draft: input })
    expect(source).toMatchObject({ workId: existing.id, isPreferred: false, lastUsedAt: null, seriesUrl: 'https://other.example/demon', lastReadUrl: 'https://other.example/demon/14' })
    expect(fixture.repositories.works.findById(existing.id)?.lastReadChapter?.label).toBe('20')
    expect(fixture.repositories.history.listByWork(existing.id)).toEqual(before)
    expect(fixture.services.library.getSummary().total).toBe(1)
  })

  it('alias confiável reconhece existente e preserva preferida ao vincular uma nova fonte', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    fixture.services.details.createAlias({ workId: existing.id, name: demon })
    const preferred = fixture.services.sources.createSource({ workId: existing.id, seriesUrl: 'https://reader.example/dragon', isPreferred: true })
    const input = { ...draft, source: { seriesUrl: 'https://other.example/demon' } }
    expect(fixture.services.details.previewCreate(input)).toMatchObject({ canKeepSeparate: false, candidates: [{ canAddSource: true }] })
    fixture.services.details.addReviewedSource({ workId: existing.id, draft: input })
    expect(fixture.repositories.sources.findById(preferred.id)?.isPreferred).toBe(true)
    expect(fixture.services.library.getSummary().total).toBe(1)
  })

  it('IDs contraditórios anulam a associação por alias e permitem preservar ambas as obras', () => {
    const fixture = setup()
    const existing = fixture.services.works.createWork({ title: dragon, mediaType: 'manhwa', userStatus: 'reading', chapter: '20', aliases: [{ name: demon }], externalRefs: [{ provider: 'anilist', externalId: '101' }] })
    const input = { ...draft, externalRefs: [{ provider: 'AniList', externalId: '202' }], source: { seriesUrl: 'https://other.example/demon/14' } }
    expect(fixture.services.workEquivalence.evaluateCreation(input)).toMatchObject({ status: 'ambiguous', candidates: [{ confidence: 'possible', signals: expect.arrayContaining(['external_conflict']) }] })
    expect(fixture.services.details.previewCreate(input)).toMatchObject({ canKeepSeparate: true, candidates: [{ identityConflict: true, canAddSource: false }] })
    expect(() => fixture.services.details.addReviewedSource({ workId: existing.id, draft: input })).toThrowError(expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }))
    const separate = fixture.services.details.createDetailed({ ...input, reviewedWorkIds: [existing.id] })
    expect(separate.work.id).not.toBe(existing.id)
    expect(separate.externalRefs[0].externalId).toBe('202')
  })

  it('avalia equivalência na transação de criação e de vínculo, incluindo título remoto fraco', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    const evaluate = fixture.services.workEquivalence.evaluateCreation.bind(fixture.services.workEquivalence)
    const guard = vi.spyOn(fixture.services.workEquivalence, 'evaluateCreation').mockImplementation((input) => {
      expect(fixture.db.inTransaction).toBe(true)
      return evaluate(input)
    })
    expect(() => fixture.services.details.createDetailed({ title: 'Tradução sem palavras em comum', mediaType: 'manga', userStatus: 'reading' }, [dragon])).toThrowError(expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }))
    expect(fixture.services.library.getSummary().total).toBe(1)
    fixture.services.details.createAlias({ workId: existing.id, name: demon })
    fixture.services.details.addReviewedSource({ workId: existing.id, draft: { ...draft, source: { seriesUrl: 'https://other.example/demon/14' } } })
    expect(guard).toHaveBeenCalledTimes(2)
  })

  it('revalida IMMEDIATE: confirmação antiga não ignora um alias forte criado depois', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    expect(fixture.services.details.previewCreate(draft).canKeepSeparate).toBe(true)
    fixture.services.details.createAlias({ workId: existing.id, name: demon })
    expect(() => fixture.services.details.createDetailed({ ...draft, reviewedWorkIds: [existing.id] })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_WORK' }))
    expect(fixture.services.library.getSummary().total).toBe(1)
  })

  it('revalida IMMEDIATE: novo candidato exige nova revisão mesmo após confirmação', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    const preview = fixture.services.details.previewCreate(draft)
    const other = fixture.services.works.createWork({ title: 'Me Casei Com o Demônio Que Matei: Retorno', mediaType: 'manhwa', userStatus: 'reading', reviewedWorkIds: [existing.id] })
    expect(() => fixture.services.works.createWork({ ...draft, reviewedWorkIds: preview.candidates.map((candidate) => candidate.work.id) })).toThrowError(expect.objectContaining({ code: 'CONFIRMATION_REQUIRED', details: expect.objectContaining({ workId: other.id }) }))
    expect(fixture.services.library.getSummary().total).toBe(2)
  })

  it('revalida vínculo: concorrente com alias igual torna a seleção ambígua', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    fixture.services.details.createAlias({ workId: existing.id, name: demon })
    const input = { ...draft, source: { seriesUrl: 'https://other.example/demon' } }
    expect(fixture.services.details.previewCreate(input).candidates[0].canAddSource).toBe(true)
    const other = createMinimalWork(fixture, 'Jornada Lunar')
    fixture.services.details.createAlias({ workId: other.id, name: demon })
    expect(() => fixture.services.details.addReviewedSource({ workId: existing.id, draft: input })).toThrowError(expect.objectContaining({ code: 'CONFIRMATION_REQUIRED' }))
    expect(fixture.repositories.sources.listByWork(existing.id)).toHaveLength(0)
  })

  it('Source Identity vence título conflitante e bloqueia fonte repetida nos capítulos 30/37/134', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    fixture.services.sources.createSource({ workId: existing.id, seriesUrl: 'https://reader.example/slug/30' })
    for (const chapter of [30, 37, 134]) {
      const input = { ...draft, chapter: String(chapter), source: { seriesUrl: `https://reader.example/slug/${chapter}` } }
      expect(fixture.resolution.resolve({ url: input.source.seriesUrl, title: demon, detectedChapter: { value: String(chapter), numericValue: chapter, confidence: 'high', source: 'url' } })).toMatchObject({ status: 'matched', work: { id: existing.id }, match: { matchedBy: 'source_url' } })
      expect(fixture.services.details.previewCreate(input)).toMatchObject({ canKeepSeparate: false, candidates: [expect.objectContaining({ canAddSource: false, reasons: expect.arrayContaining(['source']) })] })
      expect(() => fixture.services.details.createDetailed({ ...input, reviewedWorkIds: [existing.id] })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_SOURCE' }))
    }
  })

  it('preserva DUPLICATE_SOURCE se a fonte for cadastrada entre prévia e vínculo', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    fixture.services.details.createAlias({ workId: existing.id, name: demon })
    const input = { ...draft, source: { seriesUrl: 'https://other.example/demon' } }
    expect(fixture.services.details.previewCreate(input).candidates[0].canAddSource).toBe(true)
    fixture.services.sources.createSource({ workId: existing.id, seriesUrl: input.source.seriesUrl })
    expect(() => fixture.services.details.addReviewedSource({ workId: existing.id, draft: input })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_SOURCE' }))
    expect(fixture.repositories.sources.listByWork(existing.id)).toHaveLength(1)
  })

  it('ID reservado na Lixeira continua protegido, inclusive com casing diferente do provider', () => {
    const fixture = setup()
    const existing = fixture.services.works.createWork({ title: dragon, mediaType: 'manhwa', userStatus: 'reading', externalRefs: [{ provider: 'AniList', externalId: '101' }] })
    fixture.repositories.works.update({ ...existing, deletedAt: fixture.clock() })
    const input = { ...draft, externalRefs: [{ provider: 'anilist', externalId: '101' }] }
    expect(fixture.services.details.previewCreate(input)).toMatchObject({ canKeepSeparate: false, candidates: [{ work: { id: existing.id }, canAddSource: false }] })
    expect(() => fixture.services.details.createDetailed({ ...input, reviewedWorkIds: [existing.id] })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_EXTERNAL_REF' }))
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM works').get()).toEqual({ count: 1 })
  })

  it('busca manual funciona sem evidência e nunca autoriza vínculo só pelo resultado', () => {
    const fixture = setup()
    const existing = createMinimalWork(fixture, dragon, '20')
    const input = { title: 'Tradução completamente diferente', mediaType: 'manga', userStatus: 'reading', source: { seriesUrl: 'https://other.example/unknown' } }
    expect(fixture.services.details.previewCreate(input).candidates).toEqual([])
    expect(fixture.services.details.previewCreate({ ...input, search: 'Dragão' })).toMatchObject({ canKeepSeparate: true, candidates: [{ work: { id: existing.id }, canAddSource: false, reasons: ['search'] }] })
  })

  it('capa ou creator isolados apenas pedem revisão e a busca parcial permanece limitada', () => {
    const fixture = setup()
    const existing = fixture.services.details.createDetailed({ title: dragon, mediaType: 'manhwa', userStatus: 'reading', cover: { type: 'remote', sourceUrl: 'https://covers.example/same.jpg' }, creators: [{ name: 'Autora Sintética', role: 'author' }] })
    for (const evidence of [{ cover: { type: 'remote', sourceUrl: 'https://covers.example/same.jpg' } }, { creators: [{ name: 'Autora Sintética', role: 'author' }] }]) {
      expect(fixture.services.details.previewCreate({ title: 'Viagem Orbital', mediaType: 'manga', userStatus: 'reading', ...evidence })).toMatchObject({ canKeepSeparate: true, candidates: [{ work: { id: existing.work.id }, canAddSource: false }] })
    }
    const reviewedWorkIds: string[] = []
    for (let i = 0; i < 25; i++) {
      const work = fixture.services.works.createWork({ title: `Título sintético ${i}`, mediaType: 'manga', userStatus: 'reading', reviewedWorkIds })
      reviewedWorkIds.push(work.id)
      fixture.services.details.createAlias({ workId: work.id, name: `Jornada Galáctica ${i}` })
    }
    expect(new WorkResolutionRepository(fixture.db).findPossibleTitles('jornada galactica').length).toBeLessThanOrEqual(20)
  })
})
