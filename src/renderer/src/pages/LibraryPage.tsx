import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { LibraryQuery, LibrarySort, UserStatus, Work } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { FilterPanel } from '../components/library/FilterPanel'
import { VirtualLibrary } from '../components/library/VirtualLibrary'
import { LibraryBulkActions } from '../components/library/LibraryBulkActions'
import { Button, IconButton } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Select } from '../components/ui/Select'
import { useDebouncedValue } from '../hooks/use-debounced-value'
import { useWorkActions } from '../hooks/use-work-actions'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS } from '../lib/format'
import { EMPTY_LIBRARY_SELECTION, librarySelectionReducer } from '../lib/library-selection'
import { useShortcutScope } from '../app/keyboard-shortcuts'
import { navigate } from '../app/navigation'

const SORT_LABELS: Record<LibrarySort, string> = {
  last_read_desc: 'Última leitura', last_read_asc: 'Mais tempo sem ler', title_asc: 'Título A–Z', title_desc: 'Título Z–A', created_desc: 'Adicionado recentemente', updated_desc: 'Atualizado recentemente', chapter_desc: 'Capítulo', rating_desc: 'Nota'
}

export function LibraryPage({ initialStatus, initialFavorite, initialSort, collectionId, title = 'Biblioteca', kicker = 'Sua coleção', description }: { initialStatus?: UserStatus; initialFavorite?: boolean; initialSort?: LibrarySort; collectionId?: string; title?: string; kicker?: string; description?: string }) {
  const { settings, summary, updateSettings, refreshData, openAddWork } = useAppContext()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [query, setQuery] = useState<LibraryQuery>(() => ({ userStatuses: initialStatus ? [initialStatus] : undefined, favorite: initialFavorite, sort: initialSort ?? settings.librarySort }))
  const [works, setWorks] = useState<Work[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selection, dispatchSelection] = useReducer(librarySelectionReducer, EMPTY_LIBRARY_SELECTION)
  const searchRef = useRef<HTMLInputElement>(null)
  const filterAnchorRef = useRef<HTMLDivElement>(null)
  const selectionAnchor = useRef<string | null>(null)
  const previousSelectionContext = useRef('')

  useEffect(() => setQuery((current) => ({ ...current, userStatuses: initialStatus ? [initialStatus] : undefined, favorite: initialFavorite })), [initialFavorite, initialStatus])
  const effectiveQuery = useMemo(() => ({ ...query, search: debouncedSearch || undefined, collectionIds: collectionId ? [collectionId] : undefined }), [collectionId, debouncedSearch, query])
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

  const load = useCallback(async () => {
    try { setState((current) => current === 'ready' ? current : 'loading'); const next = await window.lumi.library.query(effectiveQuery); setWorks(next); dispatchSelection({ type: 'reconcile', workIds: next.map((work) => work.id) }); setState('ready') }
    catch { setState('error') }
  }, [effectiveQuery])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const handler = () => void load(); window.addEventListener('lumi:data-changed', handler); return () => window.removeEventListener('lumi:data-changed', handler) }, [load])
  useShortcutScope({
    focusSearch: () => searchRef.current?.focus(),
    escape: filtersOpen
      ? () => { setFiltersOpen(false); filterAnchorRef.current?.querySelector<HTMLElement>('button')?.focus() }
      : selection.active ? () => dispatchSelection({ type: 'exit' }) : undefined
  })
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const actions = useWorkActions(refresh)

  const chips = [
    ...(query.userStatuses ?? []).map((value) => ({ key: `status:${value}`, label: STATUS_LABELS[value], clear: () => setQuery((current) => ({ ...current, userStatuses: current.userStatuses?.filter((item) => item !== value) })) })),
    ...(query.mediaTypes ?? []).map((value) => ({ key: `type:${value}`, label: MEDIA_TYPE_LABELS[value], clear: () => setQuery((current) => ({ ...current, mediaTypes: current.mediaTypes?.filter((item) => item !== value) })) })),
    ...(query.publicationStatuses ?? []).map((value) => ({ key: `publication:${value ?? 'none'}`, label: value === null ? PUBLICATION_LABELS.none : PUBLICATION_LABELS[value], clear: () => setQuery((current) => ({ ...current, publicationStatuses: current.publicationStatuses?.filter((item) => item !== value) })) })),
    ...(query.favorite ? [{ key: 'favorite', label: 'Favoritos', clear: () => setQuery((current) => ({ ...current, favorite: undefined })) }] : []),
    ...(query.hasProgress !== undefined ? [{ key: 'progress', label: query.hasProgress ? 'Com progresso' : 'Sem progresso', clear: () => setQuery((current) => ({ ...current, hasProgress: undefined })) }] : [])
  ]

  return <div className="page library-page">
    <header className="page-header"><div><span className="page-kicker">{kicker}</span><h1>{title}</h1><p>{collectionId ? `${description ? `${description} · ` : ''}${works.length} ${works.length === 1 ? 'obra' : 'obras'}` : chips.length || search ? `${works.length} de ${summary.total} obras` : `${summary.total} ${summary.total === 1 ? 'obra' : 'obras'}`}</p></div><div className="page-header__actions">{!selection.active && <Button onClick={() => dispatchSelection({ type: 'enter' })}>Selecionar</Button>}<Button variant="primary" icon="plus" title="Adicionar obra (Ctrl+N)" onClick={openAddWork}>Adicionar obra</Button></div></header>
    <div className="library-toolbar">
      <label className="search-field"><span className="sr-only">Pesquisar Biblioteca</span><span aria-hidden="true">⌕</span><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar títulos, aliases ou autores…" /><kbd>/</kbd></label>
      <div className="filter-anchor" ref={filterAnchorRef}><Button icon="filter" className={chips.length ? 'has-indicator' : ''} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>Filtros</Button>{filtersOpen && <FilterPanel query={query} onChange={setQuery} onClose={() => setFiltersOpen(false)} />}</div>
      <div className="sort-select"><Select label="Ordenar por" value={query.sort ?? 'last_read_desc'} onChange={(value) => { const sort = value as LibrarySort; setQuery((current) => ({ ...current, sort })); void updateSettings({ librarySort: sort }) }} options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))} /></div>
      <div className="segmented" aria-label="Visualização"><IconButton icon="grid" label="Visualização em grade" className={settings.libraryView === 'grid' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'grid' })} /><IconButton icon="list" label="Visualização em lista" className={settings.libraryView === 'list' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'list' })} /></div>
    </div>
    {chips.length > 0 && <div className="active-filters">{chips.map((chip) => <button key={chip.key} onClick={chip.clear}>{chip.label}<span>×</span></button>)}<button className="clear-all" onClick={() => setQuery({ sort: query.sort })}>Limpar todos</button></div>}
    {selection.active && <LibraryBulkActions selectedIds={selection.selectedIds} resultIds={works.map((work) => work.id)} onSelectAll={() => dispatchSelection({ type: 'select-all', workIds: works.map((work) => work.id) })} onClear={() => dispatchSelection({ type: 'clear' })} onExit={() => dispatchSelection({ type: 'exit' })} onApplied={(affectedIds) => { dispatchSelection({ type: 'remove', workIds: affectedIds }); refreshData() }} />}
    <div className="library-content">
      {state === 'loading' && <LoadingState label="Abrindo sua biblioteca…" />}
      {state === 'error' && <ErrorState onRetry={() => void load()} />}
      {state === 'ready' && works.length === 0 && (search ? <EmptyState title={`Nenhuma obra encontrada para “${search}”.`} description="Tente outro termo ou limpe sua pesquisa." action={<Button onClick={() => setSearch('')}>Limpar pesquisa</Button>} /> : chips.length ? <EmptyState title="Nenhuma obra corresponde aos filtros." description="Remova alguns filtros para ampliar os resultados." action={<Button onClick={() => setQuery({ sort: query.sort })}>Limpar filtros</Button>} /> : collectionId ? <EmptyState title="Esta coleção ainda não tem obras." description="Associe obras pela página da obra ou pelas ações em lote da Biblioteca." action={<Button onClick={() => navigate('/library')}>Abrir Biblioteca</Button>} /> : <EmptyState title="Sua biblioteca ainda está vazia." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" onClick={openAddWork}>Adicionar obra</Button>} />)}
      {state === 'ready' && works.length > 0 && <VirtualLibrary works={works} view={settings.libraryView} cardSize={settings.cardSize} {...actions.handlers} selectionMode={selection.active} selectedIds={selection.selectedIds} onSelect={(work, extendRange) => {
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
  </div>
}
