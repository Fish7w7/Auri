import type { LibraryQuery, MediaType, PublicationStatus, UserStatus } from '@shared/contracts'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS } from '../../lib/format'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

function ToggleGroup<T extends string>({ title, values, selected, labels, onChange }: { title: string; values: readonly T[]; selected: T[]; labels: Record<T, string>; onChange(next: T[]): void }) {
  return <fieldset className="filter-group"><legend>{title}</legend>{values.map((value) => <label key={value} className="check-row"><input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])} /><span>{labels[value]}</span></label>)}</fieldset>
}

export function FilterPanel({ query, onChange, onClose }: { query: LibraryQuery; onChange(next: LibraryQuery): void; onClose(): void }) {
  const publication = query.publicationStatuses ?? []
  return <div className="filter-popover" role="dialog" aria-label="Filtros da Biblioteca">
    <div className="filter-popover__header"><div><strong>Filtros</strong><span>Refine sua biblioteca</span></div><button onClick={onClose} aria-label="Fechar filtros">×</button></div>
    <div className="filter-popover__content">
      <ToggleGroup title="Status pessoal" values={Object.keys(STATUS_LABELS) as UserStatus[]} selected={query.userStatuses ?? []} labels={STATUS_LABELS} onChange={(userStatuses) => onChange({ ...query, userStatuses })} />
      <ToggleGroup title="Tipo" values={Object.keys(MEDIA_TYPE_LABELS) as MediaType[]} selected={query.mediaTypes ?? []} labels={MEDIA_TYPE_LABELS} onChange={(mediaTypes) => onChange({ ...query, mediaTypes })} />
      <fieldset className="filter-group"><legend>Publicação</legend>{([...Object.keys(PUBLICATION_LABELS).filter((key) => key !== 'none') as PublicationStatus[], 'none'] as const).map((value) => { const actual = value === 'none' ? null : value; return <label key={value} className="check-row"><input type="checkbox" checked={publication.includes(actual)} onChange={() => onChange({ ...query, publicationStatuses: publication.includes(actual) ? publication.filter((item) => item !== actual) : [...publication, actual] })} /><span>{PUBLICATION_LABELS[value]}</span></label> })}</fieldset>
      <fieldset className="filter-group"><legend>Outros</legend><label className="check-row"><input type="checkbox" checked={query.favorite === true} onChange={(event) => onChange({ ...query, favorite: event.target.checked ? true : undefined })} /><span>Somente favoritos</span></label><label className="field field--compact"><span>Progresso</span><Select label="Filtro de progresso" value={query.hasProgress === undefined ? 'all' : query.hasProgress ? 'with' : 'without'} onChange={(value) => onChange({ ...query, hasProgress: value === 'all' ? undefined : value === 'with' })} options={[{ value: 'all', label: 'Todos' }, { value: 'with', label: 'Com progresso' }, { value: 'without', label: 'Sem progresso' }]} /></label></fieldset>
    </div>
    <div className="filter-popover__footer"><Button variant="ghost" onClick={() => onChange({ sort: query.sort, search: query.search })}>Limpar filtros</Button><Button variant="primary" onClick={onClose}>Concluir</Button></div>
  </div>
}
