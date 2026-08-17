import type { Work } from '@shared/contracts'
import { formatChapter, formatRelativeDate } from '../../lib/format'
import { WorkActions } from './WorkActions'
import { WorkCover } from './WorkCover'
import { WorkStatusBadge } from './WorkStatusBadge'

export function WorkListRow({ work, onOpen, onFavorite, onIncrement, onTrash }: { work: Work; onOpen(work: Work): void; onFavorite(work: Work): void; onIncrement(work: Work): void; onTrash(work: Work): void }) {
  return (
    <article className="work-list-row">
      <button className="work-list-row__open" onClick={() => onOpen(work)} aria-label={`Abrir ${work.title}`}><WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{work.mediaType.replace('_', ' ')}</small></span></button>
      <span>{formatChapter(work.lastReadChapter?.label)}</span>
      <WorkStatusBadge status={work.userStatus} />
      <span className="work-list-row__date">{formatRelativeDate(work.lastReadAt)}</span>
      <WorkActions work={work} onFavorite={onFavorite} onIncrement={onIncrement} onTrash={onTrash} />
    </article>
  )
}

