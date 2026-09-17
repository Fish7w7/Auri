import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryQuery } from '@shared/contracts'
import {
  clearLibraryFilters,
  FilterPanel,
  getActiveLibraryFilterCount,
  progressFilterQueryValue,
  toggleFilterValue
} from '@renderer/components/library/FilterPanel'

type InteractiveProps = {
  children?: ReactNode
  label?: string
  disabled?: boolean
  onClick?(): void
}

function interactiveElements(node: ReactNode): ReactElement<InteractiveProps>[] {
  const result: ReactElement<InteractiveProps>[] = []
  Children.forEach(node, (child) => {
    if (!isValidElement<InteractiveProps>(child)) return
    if (child.props.onClick || child.props.label) result.push(child)
    result.push(...interactiveElements(child.props.children))
  })
  return result
}

function panel(query: LibraryQuery, onChange = vi.fn(), onClose = vi.fn()) {
  return FilterPanel({ id: 'library-filter-panel', query, onChange, onClose })
}

describe('painel de filtros da Biblioteca', () => {
  it('mantém seleção multi-select adicionando e removendo valores', () => {
    expect(toggleFilterValue(['reading'], 'paused')).toEqual(['reading', 'paused'])
    expect(toggleFilterValue(['reading', 'paused'], 'reading')).toEqual(['paused'])
  })

  it('conta critérios ativos por grupo, sem inflar por quantidade de opções', () => {
    const query: LibraryQuery = {
      userStatuses: ['reading', 'paused'],
      mediaTypes: ['manga', 'manhwa'],
      publicationStatuses: ['ongoing', 'hiatus'],
      favorite: true,
      hasProgress: false
    }
    expect(getActiveLibraryFilterCount(query)).toBe(5)
    expect(renderToStaticMarkup(createElement(FilterPanel, { id: 'filters', query, onChange() {}, onClose() {} }))).toContain('5 filtros ativos')
  })

  it('preserva busca e ordenação ao limpar somente os filtros', () => {
    expect(clearLibraryFilters({ sort: 'title_asc', search: 'Auri', userStatuses: ['reading'], favorite: true })).toEqual({ sort: 'title_asc', search: 'Auri' })
  })

  it('mantém Limpar filtros desabilitado quando nenhum critério está ativo', () => {
    const controls = interactiveElements(panel({ sort: 'last_read_desc' }))
    expect(controls.find((item) => item.props.children === 'Limpar filtros')?.props.disabled).toBe(true)
  })

  it('aplica Progresso imediatamente e preserva a semântica dos três valores', () => {
    expect(progressFilterQueryValue('all')).toBeUndefined()
    expect(progressFilterQueryValue('with')).toBe(true)
    expect(progressFilterQueryValue('without')).toBe(false)

    const onChange = vi.fn()
    const controls = interactiveElements(panel({ sort: 'last_read_desc' }, onChange))
    controls.find((item) => item.props.children === 'Com progresso')?.props.onClick?.()
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ sort: 'last_read_desc', hasProgress: true })
  })

  it('usa Fechar como ação principal e o X acessível aciona o mesmo fechamento', () => {
    const onClose = vi.fn()
    const tree = panel({}, vi.fn(), onClose)
    const html = renderToStaticMarkup(tree)
    const controls = interactiveElements(tree)

    expect(html).toContain('aria-label="Fechar filtros"')
    expect(html).toContain('title="Fechar filtros"')
    expect(html).toContain('>Fechar</span>')
    expect(html).not.toContain('Concluir')
    expect(html).not.toContain('Aplicar filtros')

    controls.find((item) => item.props.label === 'Fechar filtros')?.props.onClick?.()
    controls.find((item) => item.props.children === 'Fechar')?.props.onClick?.()
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
