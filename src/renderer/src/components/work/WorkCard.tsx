import type { Work } from '@shared/contracts'
import { formatChapter, formatRelativeDate } from '../../lib/format'
import { WorkActions } from './WorkActions'
import { WorkCover } from './WorkCover'
import { WorkStatusBadge } from './WorkStatusBadge'

export function WorkCard({ work, onOpen, onFavorite, onIncrement, onTrash }: { work: Work; onOpen(work: Work): void; onFavorite(work: Work): void; onIncrement(work: Work): void; onTrash(work: Work): void }) {
  return (
    <article className="work-card">
      <button className="work-card__open" onClick={() => onOpen(work)} aria-label={`Abrir ${work.title}`}>
        <WorkCover work={work} />
      </button>
      <div className="work-card__body">
        <div className="work-card__heading">
          <h3 title={work.title}>{work.title}</h3>
          {work.favorite && <span className="favorite-mark" aria-label="Favorito">★</span>}
        </div>
        <p className="work-card__progress">{formatChapter(work.lastReadChapter?.label)}</p>
        <div className="work-card__meta"><WorkStatusBadge status={work.userStatus} /><span>{formatRelativeDate(work.lastReadAt)}</span></div>
      </div>
      <WorkActions work={work} onFavorite={onFavorite} onIncrement={onIncrement} onTrash={onTrash} />
    </article>
  )
}

