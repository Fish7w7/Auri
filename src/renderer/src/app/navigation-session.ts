import type { LibraryQuery } from '@shared/contracts'

export type WorkNavigationOrigin = 'home' | 'library' | 'statistics' | 'direct'

export interface LibraryNavigationContext {
  id: number
  path: string
  search: string
  query: LibraryQuery
  scrollTop: number
}

export interface LibraryNavigationSnapshot {
  path: string
  search: string
  query: LibraryQuery
  scrollTop: number
}

export interface WorkReturnTarget {
  path: string
  label: 'Home' | 'Biblioteca' | 'Estatísticas'
  libraryContextId?: number
}

let sequence = 0
let libraryContext: LibraryNavigationContext | null = null
let workNavigation: { workId: string; origin: WorkNavigationOrigin; libraryContextId?: number } | null = null
let pendingLibraryContextId: number | null = null
let activeLibrarySnapshot: LibraryNavigationSnapshot | null = null

function cloneQuery(query: LibraryQuery): LibraryQuery {
  return {
    ...query,
    userStatuses: query.userStatuses ? [...query.userStatuses] : undefined,
    mediaTypes: query.mediaTypes ? [...query.mediaTypes] : undefined,
    publicationStatuses: query.publicationStatuses ? [...query.publicationStatuses] : undefined,
    collectionIds: query.collectionIds ? [...query.collectionIds] : undefined
  }
}

function cloneContext(context: LibraryNavigationContext): LibraryNavigationContext {
  return { ...context, query: cloneQuery(context.query) }
}

export function registerWorkNavigation(workId: string, origin: WorkNavigationOrigin, snapshot?: LibraryNavigationSnapshot): void {
  pendingLibraryContextId = null
  if (origin === 'library' && snapshot) {
    libraryContext = {
      id: ++sequence,
      path: snapshot.path,
      search: snapshot.search,
      query: cloneQuery(snapshot.query),
      scrollTop: snapshot.scrollTop
    }
    workNavigation = { workId, origin, libraryContextId: libraryContext.id }
    return
  }
  workNavigation = { workId, origin }
}

export function getWorkReturnTarget(workId: string): WorkReturnTarget {
  const context = libraryContext
  if (workNavigation?.workId === workId && workNavigation.origin === 'home') {
    return { path: '/', label: 'Home' }
  }
  if (workNavigation?.workId === workId && workNavigation.origin === 'statistics') {
    return { path: '/statistics', label: 'Estatísticas' }
  }
  if (workNavigation?.workId === workId && workNavigation.origin === 'library' && context && context.id === workNavigation.libraryContextId) {
    return { path: context.path, label: 'Biblioteca', libraryContextId: context.id }
  }
  return { path: '/library', label: 'Biblioteca' }
}

export function finishWorkNavigation(workId: string): WorkReturnTarget {
  const target = getWorkReturnTarget(workId)
  workNavigation = null
  return target
}

export function armLibraryContextReturn(contextId: number): void {
  pendingLibraryContextId = contextId
}

export function peekLibraryNavigationContext(path: string): LibraryNavigationContext | null {
  if (!libraryContext || pendingLibraryContextId !== libraryContext.id || libraryContext.path !== path) return null
  return cloneContext(libraryContext)
}

export function acknowledgeLibraryNavigationContext(contextId: number): void {
  if (pendingLibraryContextId === contextId) pendingLibraryContextId = null
}

export function clearNavigationIntent(): void {
  workNavigation = null
  pendingLibraryContextId = null
}

export function setActiveLibraryNavigationSnapshot(snapshot: LibraryNavigationSnapshot): void {
  activeLibrarySnapshot = { ...snapshot, query: cloneQuery(snapshot.query) }
}

export function getActiveLibraryNavigationSnapshot(): LibraryNavigationSnapshot | null {
  return activeLibrarySnapshot ? { ...activeLibrarySnapshot, query: cloneQuery(activeLibrarySnapshot.query) } : null
}

export function clearActiveLibraryNavigationSnapshot(): void {
  activeLibrarySnapshot = null
}

export function resetNavigationSession(): void {
  sequence = 0
  libraryContext = null
  activeLibrarySnapshot = null
  clearNavigationIntent()
}
