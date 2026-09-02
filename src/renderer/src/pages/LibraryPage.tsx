import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Collection, LibraryQuery, LibrarySort, UserStatus, Work } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { FilterPanel } from '../components/library/FilterPanel'
import { VirtualLibrary } from '../components/library/VirtualLibrary'
import { LibraryBulkActions } from '../components/library/LibraryBulkActions'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Select } from '../components/ui/Select'
import { useDebouncedValue } from '../hooks/use-debounced-value'
import { useWorkActions } from '../hooks/use-work-actions'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS, mapDomainError } from '../lib/format'
import { EMPTY_LIBRARY_SELECTION, librarySelectionReducer } from '../lib/library-selection'
import { useShortcutScope } from '../app/keyboard-shortcuts'
import { currentNavigationPath, navigate, navigateToWork } from '../app/navigation'
import { KeyboardMenu } from '../components/ui/KeyboardMenu'
import { AddWorksToCollectionDialog } from '../components/collections/AddWorksToCollectionDialog'
import { useToast } from '../components/ui/Toast'
import { formatFilteredWorkCount, formatWorkCount, getLibraryEmptyStateKind } from '../lib/library-results'
import { subscribeToDataChanges } from '../app/data-changes'
import { runLatestLibraryRequest } from '../lib/latest-library-request'
import { acknowledgeLibraryNavigationContext, peekLibraryNavigationContext } from '../app/navigation-session'
import { closeLibraryFilters, focusLibraryTarget, type LibraryFocusIntent } from '../lib/library-focus'

const FILTER_PANEL_ID = 'library-filter-panel'

const SORT_LABELS: Record<LibrarySort, string> = {
  last_read_desc: 'Última leitura', last_read_asc: 'Mais tempo sem ler', title_asc: 'Título A–Z', title_desc: 'Título Z–A', created_desc: 'Adicionado recentemente', updated_desc: 'Atualizado recentemente', chapter_desc: 'Capítulo', rating_desc: 'Nota', user_status: 'Status pessoal'
}

export function LibraryPage({ initialStatus, initialFavorite, initialSort, collection, onEditCollection, onDeleteCollection }: { initialStatus?: UserStatus; initialFavorite?: boolean; initialSort?: LibrarySort; collection?: Collection; onEditCollection?(): void; onDeleteCollection?(): void }) {
  const { settings, summary, updateSettings, refreshData, openAddWork } = useAppContext()
  const { showToast } = useToast()
  const [restoredContext] = useState(() => peekLibraryNavigationContext(currentNavigationPath()))
  const [search, setSearch] = useState(() => restoredContext?.search ?? '')
  const debouncedSearch = useDebouncedValue(search)
  const [query, setQuery] = useState<LibraryQuery>(() => restoredContext?.query ?? ({ userStatuses: initialStatus ? [initialStatus] : undefined, favorite: initialFavorite, sort: initialSort ?? settings.librarySort }))
  const [works, setWorks] = useState<Work[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [updating, setUpdating] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addWorksOpen, setAddWorksOpen] = useState(false)
  const [selection, dispatchSelection] = useReducer(librarySelectionReducer, EMPTY_LIBRARY_SELECTION)
  const pageRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const filterAnchorRef = useRef<HTMLDivElement>(null)
  const scrollPosition = useRef(restoredContext?.scrollTop ?? 0)
  const scrollRestoration = useRef(restoredContext?.scrollTop)
  const pendingFocus = useRef<LibraryFocusIntent | null>(null)
  const selectionAnchor = useRef<string | null>(null)
  const previousSelectionContext = useRef('')
  const requestGeneration = useRef(0)
  const hasAcceptedResult = useRef(false)
  const collectionId = collection?.id
  const hasSearch = search.trim().length > 0
  const collectionTotal = collection?.workCount ?? 0

  useEffect(() => {
    if (restoredContext) acknowledgeLibraryNavigationContext(restoredContext.id)
  }, [restoredContext])
  const effectiveQuery = useMemo(() => ({ ...query, search: hasSearch ? debouncedSearch || undefined : undefined, collectionIds: collectionId ? [collectionId] : undefined }), [collectionId, debouncedSearch, hasSearch, query])
  const selectionContext = JSON.stringify({
    search,
    userStatuses: query.userStatuses,
    mediaTypes: query.mediaTypes,
    publicationStatuses: query.publicationStatuses,
    favorite: query.favorite,
    hasProgress: query.hasProgress,
    collectionId
  })

  useEffect(() => {
    if (previousSelectionContext.current && previousSelectionContext.current !== selectionContext) {
      dispatchSelection({ type: 'exit' })
    }
    previousSelectionContext.current = selectionContext
  }, [selectionContext])
  useEffect(() => { if (!selection.active) selectionAnchor.current = null }, [selection.active])
  useLayoutEffect(() => {
    const intent = pendingFocus.current
    if (!intent || (intent === 'selection') !== selection.active) return
    focusLibraryTarget(pageRef.current, intent)
    pendingFocus.current = null
  }, [selection.active])

  const load = useCallback(async () => {
    await runLatestLibraryRequest({
      generation: requestGeneration,
      hasAcceptedResult,
      request: () => window.auri.library.query(effectiveQuery),
      onStart: (phase) => {
        setUpdating(true)
        if (phase === 'initial') setState('loading')
      },
      onSuccess: (next) => {
        if (next.length === 0) {
          scrollRestoration.current = undefined
          scrollPosition.current = 0
        }
        setWorks(next)
        dispatchSelection({ type: 'reconcile', workIds: next.map((work) => work.id) })
        setState('ready')
      },
      onError: (_error, phase) => {
        if (phase === 'initial') setState('error')
      },
      onSettled: () => setUpdating(false)
    })
  }, [effectiveQuery])
  useEffect(() => { void load() }, [load])
  useEffect(() => subscribeToDataChanges(() => void load()), [load])
  useEffect(() => () => { requestGeneration.current += 1 }, [])
  const closeFilters = useCallback(() => {
    const trigger = filterAnchorRef.current?.querySelector<HTMLElement>('[data-library-filter-trigger]') ?? null
    closeLibraryFilters(setFiltersOpen, trigger)
  }, [])
  const exitSelection = useCallback(() => {
    pendingFocus.current = 'select-trigger'
    dispatchSelection({ type: 'exit' })
  }, [])
  useShortcutScope({
    focusSearch: () => searchRef.current?.focus(),
    escape: filtersOpen ? closeFilters : selection.active ? exitSelection : undefined
  })
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const openWork = useCallback((work: Work) => {
    navigateToWork(work.id, 'library', {
      path: currentNavigationPath(),
      search,
      query,
      scrollTop: scrollPosition.current
    })
  }, [query, search])
  const actions = useWorkActions(refresh, openWork)
  const recordScrollPosition = useCallback((scrollTop: number) => { scrollPosition.current = scrollTop }, [])
  const cancelScrollRestoration = () => { scrollRestoration.current = undefined }
  const removeFromCollection = async (work: Work) => {
    if (!collection) return
    try {
      await window.auri.collections.removeWork({ workId: work.id, collectionId: collection.id })
      refreshData()
      showToast({ kind: 'info', message: `Removida de “${collection.name}”.`, action: { label: 'Desfazer', onClick: async () => { await window.auri.collections.addWork({ workId: work.id, collectionId: collection.id }); refreshData(); showToast({ kind: 'success', message: `“${work.title}” voltou para a coleção.` }) } } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
  }

  const chips = [
    ...(query.userStatuses ?? []).map((value) => ({ key: `status:${value}`, label: STATUS_LABELS[value], clear: () => setQuery((current) => ({ ...current, userStatuses: current.userStatuses?.filter((item) => item !== value) })) })),
    ...(query.mediaTypes ?? []).map((value) => ({ key: `type:${value}`, label: MEDIA_TYPE_LABELS[value], clear: () => setQuery((current) => ({ ...current, mediaTypes: current.mediaTypes?.filter((item) => item !== value) })) })),
    ...(query.publicationStatuses ?? []).map((value) => ({ key: `publication:${value ?? 'none'}`, label: value === null ? PUBLICATION_LABELS.none : PUBLICATION_LABELS[value], clear: () => setQuery((current) => ({ ...current, publicationStatuses: current.publicationStatuses?.filter((item) => item !== value) })) })),
    ...(query.favorite ? [{ key: 'favorite', label: 'Favoritos', clear: () => setQuery((current) => ({ ...current, favorite: undefined })) }] : []),
    ...(query.hasProgress !== undefined ? [{ key: 'progress', label: query.hasProgress ? 'Com progresso' : 'Sem progresso', clear: () => setQuery((current) => ({ ...current, hasProgress: undefined })) }] : [])
  ]
  const hasFilters = chips.length > 0
  const total = collection ? collectionTotal : summary.total
  const count = collection
    ? hasSearch || hasFilters ? formatFilteredWorkCount(works.length, collectionTotal) : formatWorkCount(collectionTotal)
    : hasSearch || hasFilters ? `${works.length} de ${formatWorkCount(summary.total)}` : formatWorkCount(summary.total)
  const clearSearch = () => { setSearch(''); searchRef.current?.focus() }
  const clearFilters = () => setQuery({ sort: query.sort })

  function renderEmptyState() {
    const kind = getLibraryEmptyStateKind({ collection: Boolean(collection), total, hasSearch, hasFilters })
    const searchAction = <Button onClick={clearSearch}>Limpar pesquisa</Button>
    const filtersAction = <Button onClick={clearFilters}>Limpar filtros</Button>
    const combinedActions = <div className="empty-state__actions">{searchAction}{filtersAction}</div>
    switch (kind) {
      case 'library-empty':
        return <EmptyState title="Nenhuma obra na Biblioteca." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" onClick={openAddWork}>Adicionar obra</Button>} />
      case 'library-search':
        return <EmptyState title={`Nenhuma obra encontrada para “${search.trim()}”.`} description="Tente outro termo ou limpe sua pesquisa." action={searchAction} />
      case 'library-filters':
        return <EmptyState title="Nenhuma obra corresponde aos filtros selecionados." description="Remova alguns filtros para ampliar os resultados." action={filtersAction} />
      case 'library-search-filters':
        return <EmptyState title="Nenhuma obra corresponde à pesquisa e aos filtros atuais." description="Limpe a pesquisa ou remova alguns filtros para ampliar os resultados." action={combinedActions} />
      case 'collection-empty':
        return <EmptyState title="Nenhuma obra nesta coleção." action={<Button variant="primary" icon="plus" onClick={() => setAddWorksOpen(true)}>Adicionar obras</Button>} />
      case 'collection-search':
        return <EmptyState title="Nenhuma obra encontrada nesta coleção." description={`Nenhum resultado para “${search.trim()}”.`} action={searchAction} />
      case 'collection-filters':
        return <EmptyState title="Nenhuma obra desta coleção corresponde aos filtros." description="Remova alguns filtros para ampliar os resultados." action={filtersAction} />
      case 'collection-search-filters':
        return <EmptyState title="Nenhuma obra desta coleção corresponde à pesquisa e aos filtros atuais." description="Limpe a pesquisa ou remova alguns filtros para ampliar os resultados." action={combinedActions} />
    }
  }

  return <div className="page library-page" ref={pageRef} onPointerDownCapture={cancelScrollRestoration} onKeyDownCapture={cancelScrollRestoration} onWheelCapture={cancelScrollRestoration}>
    <header className={`page-header ${collection ? 'collection-detail-header' : ''}`}><div>{collection ? <button className="collection-breadcrumb" onClick={() => navigate('/collections')}>Coleções <span>/</span></button> : <span className="page-kicker">Sua coleção</span>}<h1>{collection?.name ?? 'Biblioteca'}</h1>{collection?.description && <p>{collection.description}</p>}<span className="page-header__count">{count}</span></div><div className="page-header__actions">{!selection.active && <Button data-library-select-trigger onClick={() => { pendingFocus.current = 'selection'; dispatchSelection({ type: 'enter' }) }}>Selecionar</Button>}{collection ? <><Button variant="primary" icon="plus" onClick={() => setAddWorksOpen(true)}>Adicionar obras</Button><KeyboardMenu className="collection-detail-menu" label={`Ações de ${collection.name}`}><button onClick={onEditCollection}>Editar coleção</button><button className="is-danger" onClick={onDeleteCollection}>Excluir coleção</button></KeyboardMenu></> : <Button variant="primary" icon="plus" title="Adicionar obra (Ctrl+N)" onClick={openAddWork}>Adicionar obra</Button>}</div></header>
    <div className="library-toolbar">
      <div className="search-field"><label className="sr-only" htmlFor="library-search">Pesquisar Biblioteca</label><span aria-hidden="true">⌕</span><input id="library-search" ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar títulos, aliases, autores ou fontes…" />{hasSearch && <IconButton type="button" className="search-field__clear" icon="x-circle" label="Limpar pesquisa" onClick={clearSearch} />}<kbd>/</kbd></div>
      <div className="filter-anchor" ref={filterAnchorRef}><Button data-library-filter-trigger icon="filter" className={chips.length ? 'has-indicator' : ''} aria-expanded={filtersOpen} aria-controls={FILTER_PANEL_ID} aria-haspopup="dialog" onClick={() => setFiltersOpen((open) => !open)}>Filtros</Button>{filtersOpen && <FilterPanel id={FILTER_PANEL_ID} query={query} onChange={setQuery} onClose={closeFilters} />}</div>
      <div className="sort-select"><Select label="Ordenar por" value={query.sort ?? 'last_read_desc'} onChange={(value) => { const sort = value as LibrarySort; setQuery((current) => ({ ...current, sort })); void updateSettings({ librarySort: sort }) }} options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))} /></div>
      <div className="segmented" role="group" aria-label="Visualização"><IconButton icon="grid" label="Visualização em grade" aria-pressed={settings.libraryView === 'grid'} className={settings.libraryView === 'grid' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'grid' })} /><IconButton icon="list" label="Visualização em lista" aria-pressed={settings.libraryView === 'list'} className={settings.libraryView === 'list' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'list' })} /></div>
    </div>
    {chips.length > 0 && <div className="active-filters">{chips.map((chip) => <button key={chip.key} onClick={chip.clear}>{chip.label}<span>×</span></button>)}<button className="clear-all" onClick={clearFilters}>Limpar todos</button></div>}
    {selection.active && <LibraryBulkActions selectedIds={selection.selectedIds} resultIds={works.map((work) => work.id)} onSelectAll={() => dispatchSelection({ type: 'select-all', workIds: works.map((work) => work.id) })} onClear={() => dispatchSelection({ type: 'clear' })} onExit={exitSelection} onApplied={(affectedIds) => { dispatchSelection({ type: 'remove', workIds: affectedIds }); refreshData() }} currentCollection={collection ? { id: collection.id, name: collection.name } : undefined} />}
    <div className="library-content" aria-busy={updating || undefined}>
      {state === 'loading' && <LoadingState label="Abrindo sua biblioteca…" />}
      {state === 'error' && <ErrorState onRetry={() => void load()} />}
      {state === 'ready' && works.length === 0 && renderEmptyState()}
      {state === 'ready' && works.length > 0 && <VirtualLibrary works={works} view={settings.libraryView} cardSize={settings.cardSize} {...actions.handlers} scrollRestoration={scrollRestoration} onScrollPositionChange={recordScrollPosition} onRemoveFromCollection={collection ? removeFromCollection : undefined} selectionMode={selection.active} selectedIds={selection.selectedIds} onSelect={(work, extendRange) => {
        const anchorIndex = selectionAnchor.current ? works.findIndex((item) => item.id === selectionAnchor.current) : -1
        const workIndex = works.findIndex((item) => item.id === work.id)
        if (extendRange && anchorIndex >= 0 && workIndex >= 0) {
          const start = Math.min(anchorIndex, workIndex)
          const end = Math.max(anchorIndex, workIndex)
          dispatchSelection({ type: 'select-all', workIds: works.slice(start, end + 1).map((item) => item.id) })
        } else {
          dispatchSelection({ type: 'toggle', workId: work.id })
          selectionAnchor.current = work.id
        }
      }} />}
    </div>
    {actions.dialog}
    {collection && <AddWorksToCollectionDialog open={addWorksOpen} collection={collection} onClose={() => setAddWorksOpen(false)} onAdded={refreshData} />}
  </div>
}
