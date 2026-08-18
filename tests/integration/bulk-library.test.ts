import { describe, expect, it } from 'vitest'
import { DomainError } from '@shared/errors/domain-error'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

describe('BulkLibraryService', () => {
  it('altera status atomicamente e atualiza os agregados da biblioteca', () => {
    const fixture = createDomainFixture()
    const first = createMinimalWork(fixture, 'Primeira')
    const second = createMinimalWork(fixture, 'Segunda')

    expect(() => fixture.services.bulk.setStatus({
      workIds: [first.id, '00000000-0000-4000-8000-000000000999'],
      userStatus: 'paused'
    })).toThrowError(DomainError)
    expect(fixture.repositories.works.findById(first.id)?.userStatus).toBe('reading')

    fixture.services.bulk.setStatus({ workIds: [first.id, second.id], userStatus: 'waiting' })
    expect(fixture.services.library.getSummary()).toMatchObject({
      total: 2,
      byStatus: { reading: 0, waiting: 2 }
    })
    fixture.db.close()
  })

  it('adiciona e remove uma tag sem duplicar ou apagar outras tags', () => {
    const fixture = createDomainFixture()
    const first = createMinimalWork(fixture, 'Primeira')
    const second = createMinimalWork(fixture, 'Segunda')
    const shared = fixture.services.details.createTag({ name: 'Compartilhada' })
    const preserved = fixture.services.details.createTag({ workId: first.id, name: 'Preservada' })

    fixture.services.bulk.addTag({ workIds: [first.id, second.id, first.id], tagId: shared.id })
    expect(fixture.repositories.tags.listByWork(first.id).map((tag) => tag.id).sort()).toEqual([preserved.id, shared.id].sort())
    expect(fixture.repositories.tags.listByWork(second.id).map((tag) => tag.id)).toEqual([shared.id])

    fixture.services.bulk.removeTag({ workIds: [first.id, second.id], tagId: shared.id })
    expect(fixture.repositories.tags.listByWork(first.id).map((tag) => tag.id)).toEqual([preserved.id])
    expect(fixture.repositories.tags.listByWork(second.id)).toEqual([])
    expect(fixture.services.details.listTags()).toHaveLength(2)
    fixture.db.close()
  })

  it('adiciona e remove uma coleção preservando os demais vínculos', () => {
    const fixture = createDomainFixture()
    const first = createMinimalWork(fixture, 'Primeira')
    const second = createMinimalWork(fixture, 'Segunda')
    const shared = fixture.services.details.createCollection({ name: 'Compartilhada' })
    const preserved = fixture.services.details.createCollection({ workId: first.id, name: 'Preservada' })

    fixture.services.bulk.addCollection({ workIds: [first.id, second.id], collectionId: shared.id })
    expect(fixture.repositories.collections.listByWork(first.id).map((collection) => collection.id).sort()).toEqual([preserved.id, shared.id].sort())

    fixture.services.bulk.removeCollection({ workIds: [first.id, second.id], collectionId: shared.id })
    expect(fixture.repositories.collections.listByWork(first.id).map((collection) => collection.id)).toEqual([preserved.id])
    expect(fixture.repositories.collections.listByWork(second.id)).toEqual([])
    fixture.db.close()
  })

  it('define favorito explicitamente e move para a Lixeira preservando dados relacionados', () => {
    const fixture = createDomainFixture()
    const work = fixture.services.works.createWork({
      title: 'Completa', mediaType: 'manhwa', userStatus: 'reading', chapter: '12',
      notes: 'Minha nota', lastReadNote: 'Retomar daqui'
    })
    const tag = fixture.services.details.createTag({ workId: work.id, name: 'Importante' })
    const collection = fixture.services.details.createCollection({ workId: work.id, name: 'Favoritas' })
    const source = fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://example.com/completa' })

    fixture.services.bulk.setFavorite({ workIds: [work.id], favorite: true })
    expect(fixture.repositories.works.findById(work.id)?.favorite).toBe(true)
    fixture.services.bulk.setFavorite({ workIds: [work.id], favorite: false })
    expect(fixture.repositories.works.findById(work.id)?.favorite).toBe(false)

    const result = fixture.services.bulk.moveToTrash({ workIds: [work.id] })
    const details = fixture.services.details.getDetails({ workId: work.id })
    expect(result.affectedIds).toEqual([work.id])
    expect(details.work.deletedAt).not.toBeNull()
    expect(details.work).toMatchObject({ notes: 'Minha nota', lastReadNote: 'Retomar daqui' })
    expect(details.tags.map((item) => item.id)).toEqual([tag.id])
    expect(details.collections.map((item) => item.id)).toEqual([collection.id])
    expect(details.sources.map((item) => item.id)).toEqual([source.id])
    expect(fixture.repositories.history.listByWork(work.id)).toHaveLength(1)
    expect(fixture.services.library.getSummary().total).toBe(0)
    fixture.db.close()
  })
})
