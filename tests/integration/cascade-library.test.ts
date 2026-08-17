import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

describe('cascade e soft delete', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  function createWorkWithEveryRelation(current: ReturnType<typeof createDomainFixture>) {
    const work = current.services.works.createWork({
      title: 'Obra Completa',
      mediaType: 'manhwa',
      userStatus: 'reading',
      chapter: '10',
      aliases: [{ name: 'Complete Work' }],
      externalRefs: [{ provider: 'anilist', externalId: '999' }]
    })
    const now = current.clock()
    current.services.sources.createSource({ workId: work.id, domain: 'source.example' })
    current.repositories.creators.create({
      id: randomUUID(),
      workId: work.id,
      name: 'Autora',
      normalizedName: 'autora',
      role: 'author',
      source: 'user',
      createdAt: now
    })
    const genre = current.repositories.genres.create({
      id: randomUUID(),
      name: 'Ação',
      normalizedName: 'acao'
    })
    current.repositories.genres.attachToWork(work.id, genre.id)
    const tag = current.repositories.tags.create({
      id: randomUUID(),
      name: 'Muito bom',
      normalizedName: 'muito bom',
      createdAt: now
    })
    current.repositories.tags.attachToWork(work.id, tag.id)
    const collection = current.repositories.collections.create({
      id: randomUUID(),
      name: 'Favoritas',
      description: null,
      createdAt: now,
      updatedAt: now
    })
    current.repositories.collections.addWork(collection.id, work.id, now)
    current.repositories.overrides.set({ workId: work.id, fieldKey: 'title', lockedAt: now })
    return { work, genre, tag, collection }
  }

  it('soft delete preserva todas as relações', () => {
    fixture = createDomainFixture()
    const { work } = createWorkWithEveryRelation(fixture)
    fixture.services.works.moveToTrash({ workId: work.id })

    for (const table of [
      'aliases',
      'external_refs',
      'sources',
      'reading_history',
      'work_creators',
      'work_genres',
      'work_tags',
      'collection_items',
      'metadata_overrides'
    ]) {
      const row = fixture.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE work_id = ?`)
        .get(work.id) as { count: number }
      expect(row.count, table).toBeGreaterThan(0)
    }
  })

  it('exclusão permanente remove relações da obra, mas não catálogos ou coleção', () => {
    fixture = createDomainFixture()
    const { work, genre, tag, collection } = createWorkWithEveryRelation(fixture)
    fixture.services.works.deletePermanently({ workId: work.id })

    for (const table of [
      'aliases',
      'external_refs',
      'sources',
      'reading_history',
      'work_creators',
      'work_genres',
      'work_tags',
      'collection_items',
      'metadata_overrides'
    ]) {
      const row = fixture.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE work_id = ?`)
        .get(work.id) as { count: number }
      expect(row.count, table).toBe(0)
    }
    expect(fixture.repositories.genres.findByNormalizedName(genre.normalizedName)?.id).toBe(genre.id)
    expect(fixture.repositories.tags.findByNormalizedName(tag.normalizedName)?.id).toBe(tag.id)
    expect(fixture.repositories.collections.findById(collection.id)?.id).toBe(collection.id)
    expect(fixture.db.pragma('foreign_key_check')).toEqual([])
  })
})

describe('LibraryService', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('busca por título, alias e creator normalizados', () => {
    fixture = createDomainFixture()
    const byTitle = createMinimalWork(fixture, 'A Vilã Vive')
    const byAlias = fixture.services.works.createWork({
      title: 'Título coreano',
      mediaType: 'manhwa',
      userStatus: 'reading',
      aliases: [{ name: 'Leitora Onisciente' }]
    })
    const byCreator = createMinimalWork(fixture, 'Outra obra')
    fixture.repositories.creators.create({
      id: randomUUID(),
      workId: byCreator.id,
      name: 'João Autor',
      normalizedName: normalizeSearchText('João Autor'),
      role: 'author',
      source: null,
      createdAt: fixture.clock()
    })

    expect(fixture.services.library.searchWorks({ query: 'vila' }).map((work) => work.id)).toEqual([
      byTitle.id
    ])
    expect(fixture.services.library.searchWorks({ query: 'leitora' }).map((work) => work.id)).toEqual([
      byAlias.id
    ])
    expect(fixture.services.library.searchWorks({ query: 'joao' }).map((work) => work.id)).toEqual([
      byCreator.id
    ])
  })

  it('exclui obras na Lixeira de listagem e busca', () => {
    fixture = createDomainFixture()
    const active = createMinimalWork(fixture, 'Ativa')
    const trash = createMinimalWork(fixture, 'Oculta')
    fixture.services.works.moveToTrash({ workId: trash.id })

    expect(fixture.services.library.listWorks().map((work) => work.id)).toEqual([active.id])
    expect(fixture.services.library.searchWorks({ query: 'oculta' })).toEqual([])
  })
})

