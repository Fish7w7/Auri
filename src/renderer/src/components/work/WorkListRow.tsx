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
  selectionMode?: boolean
  selected?: boolean
  onSelect?(work: Work): void
}

export function WorkListRow({ work, onOpen, onFavorite, onIncrement, onTrash, selectionMode = false, selected = false, onSelect }: Props) {
  const activate = () => { if (!selectionMode) onOpen(work) }
  return (
    <article className={`work-list-row ${selectionMode ? 'is-selection-mode' : ''} ${selected ? 'is-selected' : ''}`} onClick={selectionMode ? () => onSelect?.(work) : undefined}>
      <button className="work-list-row__open" onClick={activate} aria-pressed={selectionMode ? selected : undefined} aria-label={selectionMode ? `${selected ? 'Desmarcar' : 'Selecionar'} ${work.title}` : `Abrir ${work.title}`}>
        {selectionMode && <span className="work-selection-indicator" aria-hidden="true">{selected ? '✓' : ''}</span>}
        <WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{work.mediaType.replace('_', ' ')}</small></span>
      </button>
      <span>{formatChapter(work.lastReadChapter?.label)}</span>
      <WorkStatusBadge status={work.userStatus} />
      <span className="work-list-row__date">{formatRelativeDate(work.lastReadAt)}</span>
      {!selectionMode && <WorkActions work={work} onFavorite={onFavorite} onIncrement={onIncrement} onTrash={onTrash} />}
    </article>
  )
}
