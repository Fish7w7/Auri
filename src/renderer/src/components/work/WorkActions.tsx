import type { SyntheticEvent } from 'react'
import type { Work } from '@shared/contracts'
import { IconButton } from '../ui/Button'

export function stopWorkActionPropagation(event: Pick<SyntheticEvent, 'stopPropagation'>) {
  event.stopPropagation()
}

export function WorkActions({ work, onFavorite, onIncrement, onTrash }: { work: Work; onFavorite(work: Work): void; onIncrement(work: Work): void; onTrash(work: Work): void }) {
  return (
    <div
      className="work-actions"
      role="group"
      aria-label={`Ações de ${work.title}`}
      onPointerDown={stopWorkActionPropagation}
      onMouseDown={stopWorkActionPropagation}
      onClick={stopWorkActionPropagation}
    >
      <IconButton label={work.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} icon="star" className={work.favorite ? 'is-favorite' : ''} onClick={() => onFavorite(work)} />
      <IconButton label="Avançar um capítulo" icon="plus" disabled={work.lastReadChapter?.number == null} onClick={() => onIncrement(work)} />
      <IconButton label="Mover para a Lixeira" icon="trash" onClick={() => onTrash(work)} />
    </div>
  )
}
