import type { Work } from '@shared/contracts'
import { formatChapter, formatRelativeDate } from '../../lib/format'
import { Button } from '../ui/Button'
import { KeyboardMenu } from '../ui/KeyboardMenu'
import { WorkCover } from '../work/WorkCover'
import { WorkStatusBadge } from '../work/WorkStatusBadge'

interface Props {
  work: Work
  showLastReadNote: boolean
  onOpen(work: Work): void
  onContinue(work: Work): void
  onIncrement(work: Work): void
  onHide(work: Work): void
}

export function HomeWorkCard({ work, showLastReadNote, onOpen, onContinue, onIncrement, onHide }: Props) {
  const numericProgress = work.lastReadChapter?.number != null
  return <article className="work-card home-work-card">
    <button className="work-card__open" onClick={() => onOpen(work)} aria-label={`Abrir ${work.title}`}>
      <WorkCover work={work} />
    </button>
    <div className="work-card__body">
      <div className="work-card__heading"><h3 title={work.title}>{work.title}</h3></div>
      <p className="work-card__progress">{formatChapter(work.lastReadChapter?.label)}</p>
      <div className="work-card__meta"><WorkStatusBadge status={work.userStatus} /><span>{formatRelativeDate(work.lastReadAt)}</span></div>
      {showLastReadNote && work.lastReadNote && <p className="home-work-card__note" title={work.lastReadNote}>“{work.lastReadNote}”</p>}
    </div>
    <div className="home-work-card__actions">
      <Button variant="primary" onClick={() => onContinue(work)}>Continuar</Button>
      {numericProgress && <Button onClick={() => onIncrement(work)}>+1</Button>}
      <KeyboardMenu className="work-overflow home-work-menu" label={`Mais ações de ${work.title}`}><button onClick={() => onHide(work)}>Ocultar da Home</button></KeyboardMenu>
    </div>
  </article>
}