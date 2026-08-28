export type LibraryEmptyStateKind =
  | 'library-empty'
  | 'library-search'
  | 'library-filters'
  | 'library-search-filters'
  | 'collection-empty'
  | 'collection-search'
  | 'collection-filters'
  | 'collection-search-filters'

export function getLibraryEmptyStateKind(input: {
  collection: boolean
  total: number
  hasSearch: boolean
  hasFilters: boolean
}): LibraryEmptyStateKind {
  if (input.total === 0) return input.collection ? 'collection-empty' : 'library-empty'
  const prefix = input.collection ? 'collection' : 'library'
  if (input.hasSearch && input.hasFilters) return `${prefix}-search-filters`
  if (input.hasSearch) return `${prefix}-search`
  if (input.hasFilters) return `${prefix}-filters`
  return input.collection ? 'collection-empty' : 'library-empty'
}

export function formatWorkCount(count: number): string {
  return `${count} ${count === 1 ? 'obra' : 'obras'}`
}

export function formatFilteredWorkCount(visible: number, total: number): string {
  return visible === total ? formatWorkCount(total) : `${visible} de ${formatWorkCount(total)}`
}
