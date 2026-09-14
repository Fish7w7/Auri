import { useEffect, useMemo, useRef, useState } from 'react'
import type { Work } from '@shared/contracts'
import { navigate } from '../../app/navigation'
import { useAppContext } from '../../app/app-context'
import { formatChapter, STATUS_LABELS } from '../../lib/format'
import { getQuickSearchActions, type QuickSearchAction } from '../../lib/quick-search'
import { runLatestLibraryRequest } from '../../lib/latest-library-request'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { WorkCover } from '../work/WorkCover'

export type QuickSearchPhase = 'idle' | 'loading' | 'empty' | 'results' | 'error'
export function getQuickSearchPhase(query: string, loading: boolean, resultCount: number, failed: boolean): QuickSearchPhase {
  if (failed) return 'error'
  if (loading) return 'loading'
  if (!query.trim()) return 'idle'
  return resultCount > 0 ? 'results' : 'empty'
}

type QuickItem = { id: string; type: 'work'; work: Work } | { id: string; type: 'action'; action: QuickSearchAction }

export interface QuickSearchResultsState<T> {
  results: T[]
  settledQuery: string
  loading: boolean
  failed: boolean
}

export function beginQuickSearch<T>(state: QuickSearchResultsState<T>): QuickSearchResultsState<T> {
  return { ...state, loading: true, failed: false }
}

export function completeQuickSearch<T>(query: string, results: T[]): QuickSearchResultsState<T> {
  return { results, settledQuery: query, loading: false, failed: false }
}

export function failQuickSearch<T>(query: string): QuickSearchResultsState<T> {
  return { results: [], settledQuery: query, loading: false, failed: true }
}

export function normalizeQuickSearchSelection(items: readonly { id: string }[], selectedId: string | null): string | null {
  return selectedId && items.some((item) => item.id === selectedId) ? selectedId : items[0]?.id ?? null
}

const EMPTY_RESULTS: QuickSearchResultsState<Work> = { results: [], settledQuery: '', loading: false, failed: false }

export function QuickSearchDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { settings, openAddWork, openWorkFromQuickSearch } = useAppContext()
  const [query, setQuery] = useState('')
  const [searchState, setSearchState] = useState<QuickSearchResultsState<Work>>(EMPTY_RESULTS)
  const [recent, setRecent] = useState<Work[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const hasAcceptedResult = useRef(false)

  useEffect(() => {
    if (!open) return
    generation.current += 1
    hasAcceptedResult.current = false
    setQuery(''); setSearchState(EMPTY_RESULTS); setSelectedId(null); setRetry(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    void window.auri.library.home({ recentWorkIds: settings.recentWorkIds, pinnedCollectionIds: [], includeHiddenRecent: true }).then((data) => setRecent(data.recent.slice(0, 5))).catch(() => setRecent([]))
  }, [open, settings.recentWorkIds])
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    generation.current += 1
    if (!trimmed) { setSearchState(EMPTY_RESULTS); return }
    const timer = window.setTimeout(() => {
      void runLatestLibraryRequest({
        generation,
        hasAcceptedResult,
        request: () => window.auri.library.search({ query: trimmed, limit: 8, recentWorkIds: settings.recentWorkIds }),
        onStart: () => setSearchState(beginQuickSearch),
        onSuccess: (items) => setSearchState(completeQuickSearch(trimmed, items)),
        onError: () => setSearchState(failQuickSearch(trimmed)),
        onSettled: () => setSearchState((current) => current.loading ? { ...current, loading: false } : current)
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [open, query, retry, settings.recentWorkIds])
  useEffect(() => () => { generation.current += 1 }, [])

  const actions = useMemo(() => getQuickSearchActions(query), [query])
  const trimmedQuery = query.trim()
  const showingRecent = !trimmedQuery || !searchState.settledQuery
  const visibleWorks = showingRecent ? recent : searchState.results
  const items: QuickItem[] = [
    ...visibleWorks.map((work): QuickItem => ({ id: `work:${work.id}`, type: 'work', work })),
    ...actions.map((action): QuickItem => ({ id: `action:${action.id}`, type: 'action', action }))
  ]
  const currentQuerySettled = !trimmedQuery || searchState.settledQuery === trimmedQuery
  const searching = !!trimmedQuery && (!currentQuerySettled || searchState.loading)
  const phase = getQuickSearchPhase(query, searching, items.length, searchState.failed && currentQuerySettled)
  const normalizedSelectedId = normalizeQuickSearchSelection(items, selectedId)
  const active = Math.max(0, items.findIndex((item) => item.id === normalizedSelectedId))

  const run = (item: QuickItem | undefined) => {
    if (!item) return
    onClose()
    window.requestAnimationFrame(() => {
      if (item.type === 'work') openWorkFromQuickSearch(item.work.id)
      else if (item.action.command === 'add-work') openAddWork()
      else if (item.action.path) navigate(item.action.path)
    })
  }

  let offset = 0
  const workGroup = visibleWorks.length > 0 && <section className="quick-search__group" aria-labelledby="quick-search-works"><h3 id="quick-search-works">{showingRecent ? 'Recentes' : 'Obras'}</h3>{visibleWorks.map((work, index) => {
    const itemIndex = offset + index
    return <button id={`quick-result-work-${work.id}`} role="option" aria-selected={items[itemIndex]?.id === normalizedSelectedId} className={items[itemIndex]?.id === normalizedSelectedId ? 'is-active' : ''} key={work.id} onPointerMove={() => setSelectedId(items[itemIndex]?.id ?? null)} onClick={() => run(items[itemIndex])}><WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{STATUS_LABELS[work.userStatus]} · {formatChapter(work.lastReadChapter?.label)}</small></span>{work.hiddenFromHome && <em>Oculta da Home</em>}</button>
  })}</section>
  offset += visibleWorks.length
  const actionGroup = actions.length > 0 && <section className="quick-search__group" aria-labelledby="quick-search-actions"><h3 id="quick-search-actions">Ações</h3>{actions.map((action, index) => {
    const itemIndex = offset + index
    return <button id={`quick-result-action-${action.id}`} role="option" aria-selected={items[itemIndex]?.id === normalizedSelectedId} className={items[itemIndex]?.id === normalizedSelectedId ? 'is-active' : ''} key={action.id} onPointerMove={() => setSelectedId(items[itemIndex]?.id ?? null)} onClick={() => run(items[itemIndex])}><span className="quick-search__action-icon"><Icon name={action.icon} /></span><span><strong>{action.label}</strong><small>{action.command ? 'Ação' : 'Navegação'}</small></span></button>
  })}</section>

  return <Dialog open={open} title="Busca rápida" onClose={onClose}>
    <div className="quick-search">
      <label className="quick-search__field"><Icon name="search" /><input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); setSelectedId(items[(active + 1) % items.length].id) }
        if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); setSelectedId(items[(active - 1 + items.length) % items.length].id) }
        if (event.key === 'Enter') { event.preventDefault(); run(items[active]) }
      }} placeholder="Pesquisar obras ou ações..." aria-label="Pesquisar obras ou ações" aria-controls="quick-search-results" aria-activedescendant={normalizedSelectedId ? `quick-result-${normalizedSelectedId.replace(':', '-')}` : undefined} /><span className="quick-search__activity" role="status" aria-label={searching ? 'Pesquisando' : undefined}>{searching && <i aria-hidden="true" />}</span><kbd>Esc</kbd></label>
      <div id="quick-search-results" className="quick-search__results" role="listbox" aria-label="Resultados da busca rápida">
        {phase === 'empty' && <p className="quick-search__state">Nenhuma obra ou ação encontrada.</p>}
        {phase === 'error' && <div className="quick-search__state" role="alert"><p>Não foi possível consultar a Biblioteca.</p><Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div>}
        {phase !== 'empty' && phase !== 'error' && <>{workGroup}{actionGroup}</>}
      </div>
      <footer className="quick-search__hint"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></footer>
    </div>
  </Dialog>
}
