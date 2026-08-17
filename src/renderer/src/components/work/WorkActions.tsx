import type { Work } from '@shared/contracts'
import { IconButton } from '../ui/Button'

export function WorkActions({ work, onFavorite, onIncrement, onTrash }: { work: Work; onFavorite(work: Work): void; onIncrement(work: Work): void; onTrash(work: Work): void }) {
  return (
    <div className="work-actions" aria-label={`Ações de ${work.title}`}>
      <IconButton label={work.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} icon="star" className={work.favorite ? 'is-favorite' : ''} onClick={(event) => { event.stopPropagation(); onFavorite(work) }} />
      <IconButton label="Avançar um capítulo" icon="plus" disabled={work.lastReadChapter?.number == null} onClick={(event) => { event.stopPropagation(); onIncrement(work) }} />
      <IconButton label="Mover para a Lixeira" icon="trash" onClick={(event) => { event.stopPropagation(); onTrash(work) }} />
    </div>
  )
}

