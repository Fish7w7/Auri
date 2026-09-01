import { describe, expect, it } from 'vitest'
import {
  formatFilteredWorkCount,
  formatWorkCount,
  getLibraryEmptyStateKind
} from '@renderer/lib/library-results'

describe('contagens e estados vazios da Biblioteca', () => {
  it('formata total simples e resultado reduzido de coleção', () => {
    expect(formatWorkCount(1)).toBe('1 obra')
    expect(formatWorkCount(20)).toBe('20 obras')
    expect(formatFilteredWorkCount(20, 20)).toBe('20 obras')
    expect(formatFilteredWorkCount(1, 20)).toBe('1 de 20 obras')
  })

  it('prioriza vazio real e distingue busca, filtros e combinação', () => {
    expect(getLibraryEmptyStateKind({ collection: false, total: 0, hasSearch: true, hasFilters: true })).toBe('library-empty')
    expect(getLibraryEmptyStateKind({ collection: false, total: 10, hasSearch: true, hasFilters: false })).toBe('library-search')
    expect(getLibraryEmptyStateKind({ collection: false, total: 10, hasSearch: false, hasFilters: true })).toBe('library-filters')
    expect(getLibraryEmptyStateKind({ collection: false, total: 10, hasSearch: true, hasFilters: true })).toBe('library-search-filters')
    expect(getLibraryEmptyStateKind({ collection: true, total: 0, hasSearch: true, hasFilters: true })).toBe('collection-empty')
    expect(getLibraryEmptyStateKind({ collection: true, total: 10, hasSearch: true, hasFilters: true })).toBe('collection-search-filters')
  })
})
