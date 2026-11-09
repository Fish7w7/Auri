import type { HomeReadingDetails, Work } from '@shared/contracts'
import { formatChapter, formatRelativeDate } from '../../lib/format'
import { Button } from '../ui/Button'
import { KeyboardMenu } from '../ui/KeyboardMenu'
import { WorkCover } from '../work/WorkCover'
import { WorkStatusBadge } from '../work/WorkStatusBadge'

interface Props {
  work: Work
  showLastReadNote: boolean
  reading?: HomeReadingDetails
  resumeBusy?: boolean
  onOpen(work: Work): void
  onContinue(work: Work): void
  onIncrement(work: Work): void
  onHide(work: Work): void
  onChooseSource(work: Work): void
}

export function HomeWorkCard({ work, showLastReadNote, reading, resumeBusy, onOpen, onContinue, onIncrement, onHide, onChooseSource }: Props) {
  const numericProgress = work.lastReadChapter?.number != null
  return <article className="work-card home-work-card">
    <button className="work-card__open" onClick={() => onOpen(work)} aria-label={`Abrir ${work.title}`}>
      <WorkCover work={work} />
    </button>
    <div className="work-card__body">
      <div className="work-card__heading"><h3 title={work.title}>{work.title}</h3></div>
      <p className="work-card__progress">{formatChapter(work.lastReadChapter?.label)}</p>
      <div className="work-card__meta"><WorkStatusBadge status={work.userStatus} /><span>{reading && work.lastReadAt ? 'Atualizado · ' : ''}{formatRelativeDate(work.lastReadAt)}</span></div>
      {reading && <div className="home-work-card__reading">
        {reading.lastSource && <span title={reading.lastSource}>Última fonte · {reading.lastSource}</span>}
        {reading.lastActivityAt && reading.lastActivityAt !== work.lastReadAt && <span>Último acesso · {formatRelativeDate(reading.lastActivityAt)}</span>}
        {reading.sourceCount === 0 && <span>Sem endereço para retomar</span>}
      </div>}
      {showLastReadNote && work.lastReadNote && <p className="home-work-card__note" title={work.lastReadNote}>“{work.lastReadNote}”</p>}
    </div>
    <div className="home-work-card__actions">
      {reading?.sourceCount === 0 ? <Button onClick={() => onOpen(work)}>Ver detalhes</Button> : <Button variant="primary" disabled={resumeBusy} onClick={() => onContinue(work)}>Continuar</Button>}
      {numericProgress && <Button onClick={() => onIncrement(work)}>+1</Button>}
      <KeyboardMenu className="work-overflow home-work-menu" label={`Mais ações de ${work.title}`} triggerSize="compact">
        {reading && reading.sourceCount > 1 && <button disabled={resumeBusy} onClick={() => onChooseSource(work)}>Escolher outra fonte</button>}
        <button onClick={() => onHide(work)}>Ocultar da Home</button>
      </KeyboardMenu>
    </div>
  </article>
}
