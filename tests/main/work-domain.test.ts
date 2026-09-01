import { afterEach, describe, expect, it } from 'vitest'
import { DomainError } from '@shared/errors/domain-error'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

function captureError(operation: () => unknown): unknown {
  try {
    operation()
    return null
  } catch (error) {
    return error
  }
}

describe('WorkService e WorkRepository', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined

  afterEach(() => fixture?.db.close())

  it('cria uma obra mínima com defaults e boolean convertido', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const stored = fixture.repositories.works.findById(work.id)

    expect(stored).toMatchObject({
      title: 'Nano Machine',
      normalizedTitle: 'nano machine',
      publicationStatus: null,
      lastReadChapter: null,
      favorite: false,
      deletedAt: null
    })
    expect(
      fixture.db.prepare('SELECT favorite FROM works WHERE id = ?').get(work.id)
    ).toEqual({ favorite: 0 })
  })

  it('cria uma obra completa preservando NULL e tipos de domínio', () => {
    fixture = createDomainFixture()
    const work = fixture.services.works.createWork({
      title: 'Omniscient Reader',
      mediaType: 'webtoon',
      userStatus: 'waiting',
      publicationStatus: 'ongoing',
      description: 'Uma descrição.',
      countryCode: 'KR',
      startDate: '2020-05',
      endDate: null,
      chapter: '183.5',
      rating: 9.5,
      favorite: true,
      notes: 'Nota pessoal',
      lastReadNote: 'Fim do arco',
      cover: { type: 'remote', sourceUrl: 'https://example.com/cover.jpg' }
    })

    expect(work).toMatchObject({
      mediaType: 'webtoon',
      userStatus: 'waiting',
      lastReadChapter: { label: '183.5', number: 183.5 },
      favorite: true,
      endDate: null,
      cover: { type: 'remote', sourceUrl: 'https://example.com/cover.jpg', customPath: null }
    })
    expect(
      fixture.db.prepare('SELECT favorite FROM works WHERE id = ?').get(work.id)
    ).toEqual({ favorite: 1 })
  })

  it('rejeita título vazio sem tocar o banco', () => {
    fixture = createDomainFixture()
    expect(() =>
      fixture!.services.works.createWork({
        title: '   ',
        mediaType: 'manhwa',
        userStatus: 'reading'
      })
    ).toThrow(DomainError)
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM works').get()).toEqual({ count: 0 })
  })

  it('faz soft delete, separa listagens e restaura sem perder relações', () => {
    fixture = createDomainFixture()
    const work = fixture.services.works.createWork({
      title: 'Solo Leveling',
      mediaType: 'manhwa',
      userStatus: 'completed',
      aliases: [{ name: 'Only I Level Up' }]
    })

    const trashed = fixture.services.works.moveToTrash({ workId: work.id })
    expect(trashed.deletedAt).not.toBeNull()
    expect(fixture.repositories.works.listActive()).toEqual([])
    expect(fixture.services.works.listTrash()).toHaveLength(1)
    expect(fixture.repositories.aliases.listByWork(work.id)).toHaveLength(1)
    expect(captureError(() => fixture!.services.works.getWork({ workId: work.id }))).toMatchObject({
      code: 'WORK_IN_TRASH'
    })

    const restored = fixture.services.works.restoreWork({ workId: work.id })
    expect(restored.deletedAt).toBeNull()
    expect(fixture.repositories.works.listActive()).toHaveLength(1)
    expect(fixture.services.works.listTrash()).toEqual([])
  })

  it('exclui permanentemente apenas por operação explícita', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    fixture.services.works.deletePermanently({ workId: work.id })
    expect(fixture.repositories.works.exists(work.id)).toBe(false)
  })

  it('atualiza campos sem permitir que updateWork altere progresso', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Título Antigo', '10')
    const updated = fixture.services.works.updateWork({
      id: work.id,
      title: 'Título Novo',
      favorite: true,
      publicationStatus: null
    })
    expect(updated.normalizedTitle).toBe('titulo novo')
    expect(updated.favorite).toBe(true)
    expect(updated.lastReadChapter).toEqual({ label: '10', number: 10 })
  })
})

describe('aliases e external refs', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('rejeita alias repetido na mesma obra e reverte a criação inteira', () => {
    fixture = createDomainFixture()
    expect(
      captureError(() =>
        fixture!.services.works.createWork({
        title: 'Duplicada',
        mediaType: 'manga',
        userStatus: 'want_to_read',
        aliases: [{ name: 'Mesmo Alias' }, { name: 'mesmo  alias' }]
        })
      )
    ).toMatchObject({ code: 'DUPLICATE_ALIAS' })
    expect(fixture.db.prepare('SELECT COUNT(*) AS count FROM works').get()).toEqual({ count: 0 })
  })

  it('permite o mesmo alias em obras diferentes', () => {
    fixture = createDomainFixture()
    const first = fixture.services.works.createWork({
      title: 'Obra A',
      mediaType: 'manhwa',
      userStatus: 'reading',
      aliases: [{ name: 'Alias Global' }]
    })
    const second = fixture.services.works.createWork({
      title: 'Obra B',
      mediaType: 'manhwa',
      userStatus: 'reading',
      aliases: [{ name: 'Alias Global' }]
    })
    expect(fixture.repositories.aliases.listByWork(first.id)).toHaveLength(1)
    expect(fixture.repositories.aliases.listByWork(second.id)).toHaveLength(1)
  })

  it('rejeita provider/externalId global duplicado e permite providers diferentes', () => {
    fixture = createDomainFixture()
    fixture.services.works.createWork({
      title: 'Obra A',
      mediaType: 'manhwa',
      userStatus: 'reading',
      externalRefs: [{ provider: 'anilist', externalId: '123' }]
    })

    expect(
      captureError(() =>
        fixture!.services.works.createWork({
          title: 'Obra B',
          mediaType: 'manhwa',
          userStatus: 'reading',
          externalRefs: [{ provider: 'anilist', externalId: '123' }]
        })
      )
    ).toMatchObject({ code: 'DUPLICATE_EXTERNAL_REF' })

    expect(() =>
      fixture!.services.works.createWork({
        title: 'Obra C',
        mediaType: 'manhwa',
        userStatus: 'reading',
        externalRefs: [{ provider: 'mangadex', externalId: '123' }]
      })
    ).not.toThrow()
  })
})

describe('progresso inicial', () => {
  it('registra NULL → 183 como initial_progress na mesma transação', () => {
    const fixture = createDomainFixture()
    try {
      const work = createMinimalWork(fixture, 'Nano Machine', '183')
      const events = fixture.repositories.history.listByWork(work.id)
      expect(work.lastReadChapter).toEqual({ label: '183', number: 183 })
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        eventType: 'initial_progress',
        oldChapter: null,
        newChapter: { label: '183', number: 183 }
      })
    } finally {
      fixture.db.close()
    }
  })
})
