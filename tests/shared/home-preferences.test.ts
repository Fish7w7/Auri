import { describe, expect, it } from 'vitest'
import { DEFAULT_HOME_PREFERENCES, moveHomeSection, moveHomeSectionToIndex, normalizeHomePreferences, normalizeRecentWorkIds, pinHomeCollection, recordRecentWork, unpinHomeCollection } from '@shared/home-preferences'

describe('preferências da Home e Recentes', () => {
  it('recupera configuração inválida, remove desconhecidos e completa defaults', () => {
    expect(normalizeHomePreferences({
      sectionOrder: ['unknown', 'favorites', 'favorites'],
      enabledSections: { favorites: false, recent: 'sim' },
      pinnedCollectionIds: ['collection-1', 'collection-1', '', 'collection-2']
    })).toEqual({
      sectionOrder: ['favorites', 'continueReading', 'recent', 'recentlyAdded', 'collection-1', 'collection-2'],
      enabledSections: { continueReading: true, recent: true, favorites: false, recentlyAdded: false },
      pinnedCollectionIds: ['collection-1', 'collection-2']
    })
  })

  it('reordena, fixa no máximo três e remove coleção por ID', () => {
    let preferences = moveHomeSection(DEFAULT_HOME_PREFERENCES, 'recent', -1)
    expect(preferences.sectionOrder.slice(0, 2)).toEqual(['recent', 'continueReading'])
    for (const id of ['one', 'two', 'three']) preferences = pinHomeCollection(preferences, id)!
    expect(pinHomeCollection(preferences, 'four')).toBeNull()
    expect(unpinHomeCollection(preferences, 'two')).toMatchObject({ pinnedCollectionIds: ['one', 'three'] })
    expect(unpinHomeCollection(preferences, 'two').sectionOrder).not.toContain('two')
  })

  it('move uma seção diretamente para o índice atravessado durante o drag', () => {
    const afterFavorites = moveHomeSectionToIndex(DEFAULT_HOME_PREFERENCES, 'continueReading', 2)
    expect(afterFavorites.sectionOrder).toEqual(['recent', 'favorites', 'continueReading', 'recentlyAdded'])
    expect(moveHomeSectionToIndex(afterFavorites, 'recentlyAdded', 0).sectionOrder)
      .toEqual(['recentlyAdded', 'recent', 'favorites', 'continueReading'])
  })

  it('registra sem duplicar, move reabertura ao topo e limita a vinte IDs', () => {
    const ids = Array.from({ length: 22 }, (_, index) => `work-${index}`)
    expect(normalizeRecentWorkIds(ids)).toHaveLength(20)
    const reopened = recordRecentWork(ids.slice(0, 20), 'work-10')
    expect(reopened[0]).toBe('work-10')
    expect(reopened.filter((id) => id === 'work-10')).toHaveLength(1)
    expect(reopened).toHaveLength(20)
  })
})
