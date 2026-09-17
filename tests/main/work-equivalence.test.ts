import { afterEach, describe, expect, it } from 'vitest'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })
function setup() { const fixture = createDomainFixture(); fixtures.push(fixture); return fixture }

describe('WorkEquivalenceService', () => {
  it('trata o mesmo identificador externo como alta confiança', () => {
    const fixture = setup()
    const work = fixture.services.works.createWork({
      title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading',
      externalRefs: [{ provider: 'anilist', externalId: '123' }]
    })
    expect(fixture.services.workEquivalence.evaluateCreation({
      title: 'Título localizado', externalRefs: [{ provider: 'AniList', externalId: '123' }]
    })).toMatchObject({ status: 'high-confidence', candidate: { work: { id: work.id }, signals: ['external_id'] } })
  })

  it('usa título exato no resolve, mas mantém criação só por título permissiva', () => {
    const fixture = setup()
    const work = createMinimalWork(fixture, 'Nano Machine')
    expect(fixture.services.workEquivalence.evaluatePage(['Nano Machine'])).toMatchObject({
      status: 'high-confidence', candidate: { work: { id: work.id }, matchedBy: 'title', confidence: 'exact' }
    })
    expect(fixture.services.workEquivalence.evaluateCreation({ title: 'Nano Machine' })).toMatchObject({
      status: 'ambiguous', candidates: [expect.objectContaining({ work: expect.objectContaining({ id: work.id }) })]
    })
  })

  it('considera correspondência exata com alias um sinal forte', () => {
    const fixture = setup()
    const work = createMinimalWork(fixture, 'O Retorno do Cão de Caça dos Baskerville')
    fixture.services.details.createAlias({ workId: work.id, name: 'A Vingança do Cão de Caça dos Baskerville' })

    expect(fixture.services.workEquivalence.evaluatePage(['A Vingança do Cão de Caça dos Baskerville'])).toMatchObject({
      status: 'high-confidence', candidate: { work: { id: work.id }, matchedBy: 'alias' }
    })
    expect(fixture.services.workEquivalence.evaluateCreation({ title: 'A Vingança do Cão de Caça dos Baskerville' })).toMatchObject({
      status: 'high-confidence', candidate: { work: { id: work.id }, signals: expect.arrayContaining(['exact_alias']) }
    })
  })

  it('nunca promove fuzzy title, creator ou cover isolados para alta confiança', () => {
    const fixture = setup()
    const work = fixture.services.works.createWork({
      title: 'A Lenda do Norte: Retorno', mediaType: 'manhwa', userStatus: 'reading',
      cover: { type: 'remote', sourceUrl: 'https://cdn.example/cover.jpg' }
    })
    fixture.services.details.createCreator({ workId: work.id, name: 'Autor Comum', role: 'author' })

    expect(fixture.services.workEquivalence.evaluatePage(['Lenda do Norte'])).toMatchObject({ status: 'ambiguous' })
    expect(fixture.services.workEquivalence.evaluateCreation({ title: 'Outra obra', creators: [{ name: 'Autor Comum' }] })).toMatchObject({ status: 'ambiguous' })
    expect(fixture.services.workEquivalence.evaluateCreation({ title: 'Outra obra', coverUrl: 'https://cdn.example/cover.jpg' })).toMatchObject({ status: 'ambiguous' })
  })

  it('mantém sinais fortes contraditórios como ambíguos', () => {
    const fixture = setup()
    const byId = fixture.services.works.createWork({
      title: 'Obra pelo ID', mediaType: 'manga', userStatus: 'reading',
      externalRefs: [{ provider: 'anilist', externalId: '42' }]
    })
    const byAlias = createMinimalWork(fixture, 'Outra obra')
    fixture.services.details.createAlias({ workId: byAlias.id, name: 'Título informado' })

    expect(fixture.services.workEquivalence.evaluateCreation({
      title: 'Título informado', externalRefs: [{ provider: 'anilist', externalId: '42' }]
    })).toMatchObject({
      status: 'ambiguous',
      candidates: expect.arrayContaining([
        expect.objectContaining({ work: expect.objectContaining({ id: byId.id }) }),
        expect.objectContaining({ work: expect.objectContaining({ id: byAlias.id }) })
      ])
    })
  })

  it('retorna none quando nenhum sinal encontra candidato', () => {
    const fixture = setup()
    createMinimalWork(fixture, 'Nano Machine')
    expect(fixture.services.workEquivalence.evaluateCreation({ title: 'Obra completamente diferente' })).toEqual({ status: 'none' })
  })
})
