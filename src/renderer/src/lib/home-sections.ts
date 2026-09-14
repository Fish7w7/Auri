import type { HomeData, Work } from '@shared/contracts'
import type { HomePreferences } from '@shared/home-preferences'

export interface HomeSectionModel {
  key: string
  title: string
  works: Work[]
  viewAllPath?: string
  emptyTitle: string
  emptyDescription?: string
}

export function getVisibleHomeSections(data: HomeData, preferences: HomePreferences): HomeSectionModel[] {
  const builtIn: Record<string, HomeSectionModel> = {
    continueReading: { key: 'continueReading', title: 'Continuar lendo', works: data.continueReading, viewAllPath: '/library/status/reading', emptyTitle: 'Nada para continuar por enquanto.', emptyDescription: 'Quando você começar uma obra, ela aparecerá aqui.' },
    recent: { key: 'recent', title: 'Recentes', works: data.recent, emptyTitle: 'As obras que você abrir aparecerão aqui.' },
    favorites: { key: 'favorites', title: 'Favoritos', works: data.favorites, viewAllPath: '/library/favorites', emptyTitle: 'Nenhuma obra favorita para mostrar.' },
    recentlyAdded: { key: 'recentlyAdded', title: 'Adicionados recentemente', works: data.recentlyAdded, viewAllPath: '/library/sort/created_desc', emptyTitle: 'Nenhuma obra adicionada recentemente.' }
  }
  const pinned = new Map(data.pinnedCollections.map(({ collection, works }) => [collection.id, {
    key: collection.id,
    title: collection.name,
    works,
    viewAllPath: `/collections/${collection.id}`,
    emptyTitle: 'Esta coleção ainda está vazia.'
  }]))
  return preferences.sectionOrder.flatMap((id) => {
    if (id in preferences.enabledSections && !preferences.enabledSections[id as keyof typeof preferences.enabledSections]) return []
    const section = builtIn[id] ?? pinned.get(id)
    return section ? [section] : []
  })
}
