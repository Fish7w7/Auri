import type { Work } from '@shared/contracts'
import { formatChapter, formatRelativeDate } from '../../lib/format'
import { WorkActions } from './WorkActions'
import { WorkCover } from './WorkCover'
import { WorkStatusBadge } from './WorkStatusBadge'

interface Props {
  work: Work
  onOpen(work: Work): void
  onFavorite(work: Work): void
  onIncrement(work: Work): void
  onTrash(work: Work): void
  onRemoveFromCollection?(work: Work): void
  selectionMode?: boolean
  selected?: boolean
  onSelect?(work: Work, extendRange: boolean): void
}

export function WorkCard({ work, onOpen, onFavorite, onIncrement, onTrash, onRemoveFromCollection, selectionMode = false, selected = false, onSelect }: Props) {
  const activate = () => { if (!selectionMode) onOpen(work) }
  return (
    <article className={`work-card ${selectionMode ? 'is-selection-mode' : ''} ${selected ? 'is-selected' : ''}`} onClick={selectionMode ? (event) => onSelect?.(work, event.shiftKey) : undefined}>
      <button className="work-card__open" onClick={activate} aria-pressed={selectionMode ? selected : undefined} aria-label={selectionMode ? `${selected ? 'Desmarcar' : 'Selecionar'} ${work.title}` : `Abrir ${work.title}`}>
        <WorkCover work={work} />
      </button>
      {selectionMode && <span className="work-selection-indicator" aria-hidden="true">{selected ? '✓' : ''}</span>}
      <div className="work-card__body">
        <div className="work-card__heading">
          <h3 title={work.title}>{work.title}</h3>
          {work.favorite && <span className="favorite-mark" aria-label="Favorito">★</span>}
        </div>
        <p className="work-card__progress">{formatChapter(work.lastReadChapter?.label)}</p>
        <div className="work-card__meta"><WorkStatusBadge status={work.userStatus} /><span>{formatRelativeDate(work.lastReadAt)}</span></div>
      </div>
      {!selectionMode && <WorkActions work={work} onFavorite={onFavorite} onIncrement={onIncrement} onTrash={onTrash} onRemoveFromCollection={onRemoveFromCollection} />}
    </article>
  )
}
