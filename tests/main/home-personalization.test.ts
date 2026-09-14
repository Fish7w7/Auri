import { afterEach, describe, expect, it } from 'vitest'
import { createDomainFixture } from '../fixtures/domain-fixture'

describe('dados da Home personalizável', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('usa a mesma fonte de Recentes, respeita hiddenFromHome e ignora IDs órfãos', () => {
    fixture = createDomainFixture()
    const first = fixture.services.works.createWork({ title: 'Primeira', mediaType: 'manga', userStatus: 'reading', favorite: true })
    const hidden = fixture.services.works.createWork({ title: 'Oculta', mediaType: 'manga', userStatus: 'reading', favorite: true, hiddenFromHome: true })
    const second = fixture.services.works.createWork({ title: 'Segunda', mediaType: 'manga', userStatus: 'paused' })
    const ids = [second.id, hidden.id, first.id, 'inexistente']

    const home = fixture.services.library.getHome({ recentWorkIds: ids })
    expect(home.recent.map((work) => work.id)).toEqual([second.id, first.id])
    expect(home.continueReading.map((work) => work.id)).toEqual([first.id])
    expect(home.favorites.map((work) => work.id)).toEqual([first.id])

    const palette = fixture.services.library.getHome({ recentWorkIds: ids, includeHiddenRecent: true })
    expect(palette.recent.map((work) => work.id)).toEqual([second.id, hidden.id, first.id])
  })

  it('resolve coleção fixada por ID, acompanha rename/delete e mantém estado vazio', () => {
    fixture = createDomainFixture()
    const visible = fixture.services.works.createWork({ title: 'Visível', mediaType: 'manhwa', userStatus: 'reading' })
    const hidden = fixture.services.works.createWork({ title: 'Oculta', mediaType: 'manhwa', userStatus: 'reading', hiddenFromHome: true })
    const collection = fixture.services.details.createCollection({ name: 'Quero ler', workId: visible.id })
    fixture.repositories.collections.addWork(collection.id, hidden.id, fixture.clock())

    let home = fixture.services.library.getHome({ pinnedCollectionIds: [collection.id] })
    expect(home.pinnedCollections[0].collection.name).toBe('Quero ler')
    expect(home.pinnedCollections[0].works.map((work) => work.id)).toEqual([visible.id])

    fixture.services.details.updateCollection({ id: collection.id, name: 'Comédia' })
    home = fixture.services.library.getHome({ pinnedCollectionIds: [collection.id] })
    expect(home.pinnedCollections[0].collection.name).toBe('Comédia')
    fixture.repositories.collections.removeWork(collection.id, visible.id)
    expect(fixture.services.library.getHome({ pinnedCollectionIds: [collection.id] }).pinnedCollections[0].works).toEqual([])
    fixture.services.details.deleteCollection({ collectionId: collection.id })
    expect(fixture.services.library.getHome({ pinnedCollectionIds: [collection.id] }).pinnedCollections).toEqual([])
  })
})
