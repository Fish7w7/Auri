import { describe, expect, it } from 'vitest'
import { DomainError } from '@shared/errors/domain-error'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

describe('WorkDetailsService', () => {
  it('cria cadastro manual completo e agrega todos os detalhes', () => {
    const fixture = createDomainFixture()
    const collection = fixture.services.details.createCollection({ name: 'Murim favoritos' })
    const details = fixture.services.details.createDetailed({
      title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading', chapter: '183',
      description: 'Um guerreiro recebe nanotecnologia.', countryCode: 'KR', startDate: '2020',
      aliases: [{ name: '나노마신', kind: 'original', source: 'user' }],
      creators: [{ name: 'Han-Joong-Wue', role: 'author', source: 'user' }],
      genres: ['Ação', 'Murim'], tags: ['Muito bom'], collectionIds: [collection.id],
      source: { seriesUrl: 'https://scanx.example/nano-machine', language: 'pt-BR', isPreferred: true }
    })
    expect(details.work.lastReadChapter?.label).toBe('183')
    expect(details.aliases[0].name).toBe('나노마신')
    expect(details.creators[0].role).toBe('author')
    expect(details.genres.map((item) => item.name)).toEqual(['Ação', 'Murim'])
    expect(details.tags[0].name).toBe('Muito bom')
    expect(details.collections[0].name).toBe('Murim favoritos')
    expect(details.sources[0]).toMatchObject({ domain: 'scanx.example', isPreferred: true })
    expect(details.sources[0].lastUsedAt).not.toBeNull()
    expect(fixture.repositories.history.listByWork(details.work.id)[0]).toMatchObject({
      eventType: 'initial_progress',
      sourceId: details.sources[0].id,
      sourceDomainSnapshot: 'scanx.example'
    })
    fixture.db.close()
  })

  it('gerencia aliases, creators, gêneros, tags e coleções sem duplicar por casing', () => {
    const fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const alias = fixture.services.details.createAlias({ workId: work.id, name: 'Alternative', kind: 'alternative' })
    expect(() => fixture.services.details.createAlias({ workId: work.id, name: 'alternative' })).toThrowError(DomainError)
    fixture.services.details.updateAlias({ id: alias.id, name: 'Alternative title' })
    const creator = fixture.services.details.createCreator({ workId: work.id, name: 'Geum-Gang', role: 'artist' })
    fixture.services.details.updateCreator({ id: creator.id, role: 'author' })
    const genre = fixture.services.details.createGenre({ workId: work.id, name: 'Ação' })
    const tag = fixture.services.details.createTag({ workId: work.id, name: 'Murim' })
    expect(fixture.services.details.createTag({ workId: work.id, name: 'murim' }).id).toBe(tag.id)
    const collection = fixture.services.details.createCollection({ workId: work.id, name: 'Obras excelentes', description: 'Favoritas' })
    fixture.services.details.updateCollection({ id: collection.id, description: 'Nota dez' })
    let details = fixture.services.details.getDetails({ workId: work.id })
    expect(details.tags).toHaveLength(1)
    expect(details.collections[0].description).toBe('Nota dez')
    fixture.services.details.removeGenreFromWork({ workId: work.id, genreId: genre.id })
    fixture.services.details.removeTagFromWork({ workId: work.id, tagId: tag.id })
    fixture.services.details.deleteAlias({ aliasId: alias.id })
    fixture.services.details.deleteCreator({ creatorId: creator.id })
    fixture.services.details.removeWorkFromCollection({ workId: work.id, collectionId: collection.id })
    details = fixture.services.details.getDetails({ workId: work.id })
    expect([details.aliases, details.creators, details.genres, details.tags, details.collections].every((items) => items.length === 0)).toBe(true)
    expect(fixture.services.details.listTags()).toHaveLength(1)
    fixture.db.close()
  })

  it('salva edição relacional atomicamente e cria apenas overrides de metadata', () => {
    const fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    fixture.services.details.updateDetailed({
      work: { id: work.id, title: 'Nano Machine — edição', description: 'Descrição', userStatus: 'paused' },
      aliases: [{ name: '나노마신', kind: 'original', source: 'user' }],
      creators: [{ name: 'Han', role: 'author', source: 'user' }],
      genres: ['Ação']
    })
    const keys = fixture.repositories.overrides.listByWork(work.id).map((item) => item.fieldKey).sort()
    expect(keys).toEqual(['aliases', 'creators', 'description', 'genres', 'title'])
    expect(keys).not.toContain('user_status')
    const before = fixture.services.details.getDetails({ workId: work.id })
    expect(() => fixture.services.details.updateDetailed({ work: { id: work.id, title: 'Não deve persistir' }, aliases: [{ name: 'Igual' }, { name: 'igual' }] })).toThrow()
    expect(fixture.services.details.getDetails({ workId: work.id }).work.title).toBe(before.work.title)
    fixture.db.close()
  })

  it('mantém uma única fonte preferida e preserva histórico ao excluir fonte', () => {
    const fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Fonte', '10')
    const first = fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://a.example/work', isPreferred: true })
    const second = fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://b.example/work', isPreferred: true })
    expect(fixture.repositories.sources.findById(first.id)?.isPreferred).toBe(false)
    expect(fixture.repositories.sources.findById(second.id)?.isPreferred).toBe(true)
    fixture.services.progress.updateProgress({ workId: work.id, chapterLabel: '11', sourceId: second.id })
    fixture.services.sources.deleteSourcePermanently({ sourceId: second.id })
    const event = fixture.repositories.history.listByWork(work.id)[0]
    expect(event.sourceId).toBeNull()
    expect(event.sourceDomainSnapshot).toBe('b.example')
    fixture.db.close()
  })
})
