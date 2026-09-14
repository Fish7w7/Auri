export const HOME_BUILT_IN_SECTIONS = ['continueReading', 'recent', 'favorites', 'recentlyAdded'] as const
export type HomeBuiltInSection = (typeof HOME_BUILT_IN_SECTIONS)[number]

export interface HomePreferences {
  sectionOrder: string[]
  enabledSections: Record<HomeBuiltInSection, boolean>
  pinnedCollectionIds: string[]
}

export const DEFAULT_HOME_PREFERENCES: HomePreferences = {
  sectionOrder: [...HOME_BUILT_IN_SECTIONS],
  enabledSections: {
    continueReading: true,
    recent: true,
    favorites: true,
    recentlyAdded: false
  },
  pinnedCollectionIds: []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function localIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 128))].slice(0, limit)
}

export function normalizeRecentWorkIds(value: unknown): string[] {
  return localIds(value, 20)
}

export function recordRecentWork(ids: readonly string[], workId: string): string[] {
  return normalizeRecentWorkIds([workId, ...ids.filter((id) => id !== workId)])
}

export function normalizeHomePreferences(value: unknown): HomePreferences {
  const input = record(value)
  const enabled = record(input.enabledSections)
  const pinnedCollectionIds = localIds(input.pinnedCollectionIds, 3)
  const allowed = new Set<string>([...HOME_BUILT_IN_SECTIONS, ...pinnedCollectionIds])
  const requestedOrder = Array.isArray(input.sectionOrder) ? input.sectionOrder : []
  const sectionOrder = [...new Set(requestedOrder.filter((item): item is string => typeof item === 'string' && allowed.has(item)))]
  for (const id of [...HOME_BUILT_IN_SECTIONS, ...pinnedCollectionIds]) if (!sectionOrder.includes(id)) sectionOrder.push(id)
  return {
    sectionOrder,
    enabledSections: Object.fromEntries(HOME_BUILT_IN_SECTIONS.map((id) => [id, typeof enabled[id] === 'boolean' ? enabled[id] : DEFAULT_HOME_PREFERENCES.enabledSections[id]])) as Record<HomeBuiltInSection, boolean>,
    pinnedCollectionIds
  }
}

export function moveHomeSection(preferences: HomePreferences, sectionId: string, direction: -1 | 1): HomePreferences {
  const order = [...preferences.sectionOrder]
  const from = order.indexOf(sectionId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return preferences
  ;[order[from], order[to]] = [order[to], order[from]]
  return { ...preferences, sectionOrder: order }
}

export function moveHomeSectionToIndex(preferences: HomePreferences, sectionId: string, targetIndex: number): HomePreferences {
  const order = [...preferences.sectionOrder]
  const from = order.indexOf(sectionId)
  const to = Math.max(0, Math.min(order.length - 1, Math.trunc(targetIndex)))
  if (from < 0 || from === to) return preferences
  const [section] = order.splice(from, 1)
  order.splice(to, 0, section)
  return { ...preferences, sectionOrder: order }
}

export function pinHomeCollection(preferences: HomePreferences, collectionId: string): HomePreferences | null {
  if (preferences.pinnedCollectionIds.includes(collectionId)) return preferences
  if (preferences.pinnedCollectionIds.length >= 3) return null
  return normalizeHomePreferences({
    ...preferences,
    pinnedCollectionIds: [...preferences.pinnedCollectionIds, collectionId],
    sectionOrder: [...preferences.sectionOrder, collectionId]
  })
}

export function unpinHomeCollection(preferences: HomePreferences, collectionId: string): HomePreferences {
  return normalizeHomePreferences({
    ...preferences,
    pinnedCollectionIds: preferences.pinnedCollectionIds.filter((id) => id !== collectionId),
    sectionOrder: preferences.sectionOrder.filter((id) => id !== collectionId)
  })
}
