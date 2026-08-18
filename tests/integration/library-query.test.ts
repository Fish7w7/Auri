import { afterEach, describe, expect, it } from 'vitest'
import type { Work } from '@shared/contracts'
import { createDomainFixture } from '../helpers/domain-fixture'

describe('LibraryService — filtros, resumo e Home', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  function create(input: Partial<{ title: string; mediaType: Work['mediaType']; userStatus: Work['userStatus']; publicationStatus: Work['publicationStatus']; favorite: boolean; chapter: string; notes: string; lastReadNote: string }>) {
    return fixture!.services.works.createWork({
      title: input.title ?? 'Obra',
      mediaType: input.mediaType ?? 'manhwa',
      userStatus: input.userStatus ?? 'reading',
      publicationStatus: input.publicationStatus,
      favorite: input.favorite,
      chapter: input.chapter,
      notes: input.notes,
      lastReadNote: input.lastReadNote
    })
  }

  it('combina status, favorito, tipo, publicação e progresso no SQLite', () => {
    fixture = createDomainFixture()
    const expected = create({ title: 'Esperada', mediaType: 'manhwa', userStatus: 'reading', publicationStatus: 'ongoing', favorite: true, chapter: '10' })
    create({ title: 'Manga', mediaType: 'manga', userStatus: 'reading', publicationStatus: 'ongoing', favorite: true, chapter: '10' })
    create({ title: 'Sem progresso', mediaType: 'manhwa', userStatus: 'reading', publicationStatus: 'ongoing', favorite: true })
    create({ title: 'Pausada', mediaType: 'manhwa', userStatus: 'paused', publicationStatus: 'ongoing', favorite: true, chapter: '10' })

    const result = fixture.services.library.queryWorks({
      userStatuses: ['reading'],
      mediaTypes: ['manhwa'],
      publicationStatuses: ['ongoing'],
      favorite: true,
      hasProgress: true
    })
    expect(result.map((work) => work.id)).toEqual([expected.id])
  })

  it('distingue publicação NULL de unknown', () => {
    fixture = createDomainFixture()
    const noInfo = create({ title: 'Sem informação', publicationStatus: null })
    const unknown = create({ title: 'Desconhecida', publicationStatus: 'unknown' })
    expect(fixture.services.library.queryWorks({ publicationStatuses: [null] }).map((work) => work.id)).toEqual([noInfo.id])
    expect(fixture.services.library.queryWorks({ publicationStatuses: ['unknown'] }).map((work) => work.id)).toEqual([unknown.id])
  })

  it('combina pesquisa normalizada com filtro', () => {
    fixture = createDomainFixture()
    const reading = create({ title: 'A Vilã Vive', userStatus: 'reading' })
    create({ title: 'A Vilã Retorna', userStatus: 'paused' })
    expect(fixture.services.library.queryWorks({ search: 'vila', userStatuses: ['reading'] }).map((work) => work.id)).toEqual([reading.id])
  })

  it('filtra obras pela coleção existente e preserva as obras ao excluí-la', () => {
    fixture = createDomainFixture()
    const included = create({ title: 'Na coleção' })
    const outside = create({ title: 'Fora da coleção' })
    const collection = fixture.services.details.createCollection({ workId: included.id, name: 'Favoritas' })

    expect(fixture.services.library.queryWorks({ collectionIds: [collection.id] }).map((work) => work.id)).toEqual([included.id])
    fixture.services.details.deleteCollection({ collectionId: collection.id })
    expect(fixture.repositories.works.findById(included.id)).not.toBeNull()
    expect(fixture.repositories.works.findById(outside.id)).not.toBeNull()
  })

  it('informa a quantidade de obras ativas em cada coleção', () => {
    fixture = createDomainFixture()
    const active = create({ title: 'Ativa' })
    const removed = create({ title: 'Na lixeira' })
    const collection = fixture.services.details.createCollection({ workId: active.id, name: 'Favoritas' })
    fixture.repositories.collections.addWork(collection.id, removed.id, fixture.clock())
    fixture.services.works.moveToTrash({ workId: removed.id })

    expect(fixture.services.details.listCollections()).toEqual([
      expect.objectContaining({ id: collection.id, workCount: 1 })
    ])
  })

  it('encontra localmente alias em português adicionado pelo usuário', () => {
    fixture = createDomainFixture()
    const work = create({ title: 'The Shepherd Wizard' })
    const alias = fixture.services.details.createAlias({ workId: work.id, name: 'O Arquimago do Vale', kind: 'localized', source: 'user' })
    expect(alias.source).toBe('user')
    expect(fixture.services.library.queryWorks({ search: 'o arquimago do vale' }).map((item) => item.id)).toEqual([work.id])
  })

  it('ordena última leitura com NULL depois e suporta capítulo/nota', () => {
    fixture = createDomainFixture()
    const older = create({ title: 'Antiga', chapter: '10' })
    const newer = create({ title: 'Nova', chapter: '20' })
    const never = create({ title: 'Nunca' })
    fixture.repositories.works.updateProgress(older.id, older.lastReadChapter, '2026-01-01T00:00:00.000Z', fixture.clock())
    fixture.repositories.works.updateProgress(newer.id, newer.lastReadChapter, '2026-08-01T00:00:00.000Z', fixture.clock())

    expect(fixture.services.library.queryWorks({ sort: 'last_read_desc' }).map((work) => work.id)).toEqual([newer.id, older.id, never.id])
    expect(fixture.services.library.queryWorks({ sort: 'chapter_desc' }).map((work) => work.id)).toEqual([newer.id, older.id, never.id])
  })

  it('classifica a Home por continuidade sem repetir obras entre seções', () => {
    fixture = createDomainFixture()
    const recent = create({ title: 'Recente', userStatus: 'reading', favorite: true, chapter: '2', notes: 'Nota geral', lastReadNote: 'Chegaram à seita do norte.' })
    const stale = create({ title: 'Antiga', userStatus: 'reading', chapter: '4' })
    const neverRead = create({ title: 'Nunca lida', userStatus: 'reading' })
    const waiting = create({ title: 'Esperando', userStatus: 'waiting', chapter: '8' })
    const added = create({ title: 'Adicionada', userStatus: 'want_to_read' })
    const trash = create({ title: 'Oculta', userStatus: 'reading' })
    fixture.repositories.works.updateProgress(recent.id, recent.lastReadChapter, '2026-08-16T00:00:00.000Z', fixture.clock())
    fixture.repositories.works.updateProgress(stale.id, stale.lastReadChapter, '2026-07-18T00:00:00.000Z', fixture.clock())
    fixture.services.works.moveToTrash({ workId: trash.id })

    const summary = fixture.services.library.getSummary()
    expect(summary).toMatchObject({ total: 5, favorite: 1, byStatus: { reading: 3, waiting: 1, want_to_read: 1 } })
    const home = fixture.services.library.getHome(new Date('2026-08-17T00:00:00.000Z'))
    expect(home.continueReading.map((work) => work.id)).toEqual([recent.id, neverRead.id])
    expect(home.staleReading.map((work) => work.id)).toEqual([stale.id])
    expect(home.waiting.map((work) => work.id)).toEqual([waiting.id])
    expect(home.recentlyAdded.map((work) => work.id)).toEqual([added.id])
    expect(home.continueReading[0]).toMatchObject({ lastReadNote: 'Chegaram à seita do norte.', notes: 'Nota geral' })
    expect(new Set(Object.values(home).flat().map((work) => work.id)).size).toBe(Object.values(home).flat().length)
    expect(Object.values(home).flat().some((work) => work.id === trash.id)).toBe(false)
  })

  it('reflete mudanças de progresso e status na próxima leitura da Home', () => {
    fixture = createDomainFixture()
    const work = create({ title: 'Retomada', userStatus: 'reading', chapter: '10' })
    fixture.repositories.works.updateProgress(work.id, work.lastReadChapter, '2026-01-01T00:00:00.000Z', fixture.clock())
    let home = fixture.services.library.getHome(new Date('2026-08-17T00:00:00.000Z'))
    expect(home.staleReading.map((item) => item.id)).toEqual([work.id])

    fixture.services.progress.incrementProgress({ workId: work.id })
    home = fixture.services.library.getHome(new Date('2026-08-17T23:59:59.000Z'))
    expect(home.continueReading[0]).toMatchObject({ id: work.id, lastReadChapter: { label: '11', number: 11 } })
    expect(home.staleReading).toEqual([])

    fixture.services.works.updateWork({ id: work.id, userStatus: 'waiting' })
    home = fixture.services.library.getHome(new Date('2026-08-17T23:59:59.000Z'))
    expect(home.continueReading).toEqual([])
    expect(home.waiting.map((item) => item.id)).toEqual([work.id])
  })
})
