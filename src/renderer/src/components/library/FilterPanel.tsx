import type { LibraryQuery, MediaType, PublicationStatus, UserStatus } from '@shared/contracts'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS } from '../../lib/format'
import { Button, IconButton } from '../ui/Button'

const PROGRESS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'with', label: 'Com progresso' },
  { value: 'without', label: 'Sem progresso' }
] as const

type ProgressFilter = typeof PROGRESS_OPTIONS[number]['value']

export function toggleFilterValue<T>(selected: readonly T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
}

export function getActiveLibraryFilterCount(query: LibraryQuery): number {
  return Number(Boolean(query.userStatuses?.length))
    + Number(Boolean(query.mediaTypes?.length))
    + Number(Boolean(query.publicationStatuses?.length))
    + Number(query.favorite === true)
    + Number(query.hasProgress !== undefined)
}

export function clearLibraryFilters(query: LibraryQuery): LibraryQuery {
  return { sort: query.sort, search: query.search }
}

export function progressFilterValue(query: LibraryQuery): ProgressFilter {
  return query.hasProgress === undefined ? 'all' : query.hasProgress ? 'with' : 'without'
}

export function progressFilterQueryValue(value: ProgressFilter): boolean | undefined {
  return value === 'all' ? undefined : value === 'with'
}

function FilterOption({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange(): void; disabled?: boolean }) {
  return <label className="filter-option">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
    <span className="filter-option__check" aria-hidden="true">✓</span>
    <span>{label}</span>
  </label>
}

function ToggleGroup<T extends string>({ title, values, selected, labels, onChange }: { title: string; values: readonly T[]; selected: T[]; labels: Record<T, string>; onChange(next: T[]): void }) {
  return <fieldset className="filter-group"><legend>{title}</legend><div className="filter-options">{values.map((value) => <FilterOption key={value} checked={selected.includes(value)} label={labels[value]} onChange={() => onChange(toggleFilterValue(selected, value))} />)}</div></fieldset>
}

interface FilterPanelKeyEvent {
  key: string
  preventDefault(): void
  stopPropagation(): void
}

export function handleFilterPanelKeyDown(event: FilterPanelKeyEvent, onClose: () => void): boolean {
  if (event.key !== 'Escape') return false
  event.preventDefault()
  event.stopPropagation()
  onClose()
  return true
}

export function FilterPanel({ id, query, onChange, onClose }: { id: string; query: LibraryQuery; onChange(next: LibraryQuery): void; onClose(): void }) {
  const publication = query.publicationStatuses ?? []
  const activeCount = getActiveLibraryFilterCount(query)
  const activeLabel = `${activeCount} ${activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}`

  return <div id={id} className="filter-popover" role="dialog" aria-label="Filtros da Biblioteca" onKeyDownCapture={(event) => handleFilterPanelKeyDown(event, onClose)}>
    <div className="filter-popover__header">
      <div className="filter-popover__heading"><div><strong>Filtros</strong>{activeCount > 0 && <span className="filter-popover__count" role="status" aria-live="polite">{activeLabel}</span>}</div><span>Refine sua biblioteca</span></div>
      <IconButton type="button" className="filter-popover__close" icon="x-circle" label="Fechar filtros" onClick={onClose} />
    </div>
    <div className="filter-popover__content">
      <div className="filter-popover__groups">
        <ToggleGroup title="Status pessoal" values={Object.keys(STATUS_LABELS) as UserStatus[]} selected={query.userStatuses ?? []} labels={STATUS_LABELS} onChange={(userStatuses) => onChange({ ...query, userStatuses })} />
        <ToggleGroup title="Tipo" values={Object.keys(MEDIA_TYPE_LABELS) as MediaType[]} selected={query.mediaTypes ?? []} labels={MEDIA_TYPE_LABELS} onChange={(mediaTypes) => onChange({ ...query, mediaTypes })} />
        <fieldset className="filter-group"><legend>Publicação</legend><div className="filter-options">{([...Object.keys(PUBLICATION_LABELS).filter((key) => key !== 'none') as PublicationStatus[], 'none'] as const).map((value) => { const actual = value === 'none' ? null : value; return <FilterOption key={value} checked={publication.includes(actual)} label={PUBLICATION_LABELS[value]} onChange={() => onChange({ ...query, publicationStatuses: toggleFilterValue(publication, actual) })} /> })}</div></fieldset>
      </div>
      <div className="filter-popover__secondary">
        <fieldset className="filter-group filter-group--other"><legend>Outros</legend><FilterOption checked={query.favorite === true} label="Somente favoritos" onChange={() => onChange({ ...query, favorite: query.favorite ? undefined : true })} /></fieldset>
        <fieldset className="filter-group filter-group--progress"><legend>Progresso</legend><div className="filter-progress" role="group" aria-label="Filtro de progresso">{PROGRESS_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={progressFilterValue(query) === option.value} onClick={() => onChange({ ...query, hasProgress: progressFilterQueryValue(option.value) })}>{option.label}</button>)}</div></fieldset>
      </div>
    </div>
    <div className="filter-popover__footer"><Button variant="ghost" disabled={activeCount === 0} onClick={() => onChange(clearLibraryFilters(query))}>Limpar filtros</Button><Button variant="primary" onClick={onClose}>Fechar</Button></div>
  </div>
}
