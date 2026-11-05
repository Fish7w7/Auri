import { useEffect, useRef, useState } from 'react'
import type { WorkCreationReview as Review, WorkCreationReviewRequest } from '@shared/contracts'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { mapDomainError } from '../../lib/format'
import { createReviewRequestGuard, type CreationReviewFailure } from '../../lib/work-creation-review'
import { Button } from '../ui/Button'
import { WorkCover } from './WorkCover'

export function WorkCreationReview({ draft, review, busy, failure, onRetry, onOpen, onAddSource, onKeepSeparate }: {
  draft: WorkCreationReviewRequest
  review: Review
  busy: boolean
  failure?: CreationReviewFailure
  onRetry?(): void
  onOpen(workId: string): void
  onAddSource(workId: string): void
  onKeepSeparate(reviewedWorkIds: string[]): void
}) {
  const [query, setQuery] = useState('')
  const search = useDebouncedValue(query, 300)
  const [result, setResult] = useState<{ review: Review; draft: WorkCreationReviewRequest; search: string; value?: Review; error?: string } | null>(null)
  const requests = useRef(createReviewRequestGuard())
  const heading = useRef<HTMLHeadingElement>(null)
  const unverified = Boolean(failure?.refreshFailed)
  // Results belong to their exact base review and query. An old result cannot
  // restore actions removed by a newer authoritative review, even before effects run.
  const current = result?.review === review && result.draft === draft && result.search === search ? result : null
  const display = Boolean(search.trim()) && !busy && !unverified && current?.value ? current.value : review
  const error = current?.error
  const searching = Boolean(query.trim()) && (query !== search || !current)
  const actionsBlocked = busy || unverified || searching || Boolean(error)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    const isCurrent = requests.current.start()
    if (!search.trim() || busy || unverified) return () => requests.current.invalidate()
    void window.auri.works.previewCreate({ ...draft, search })
      .then((value) => { if (isCurrent()) setResult({ review, draft, search, value }) })
      .catch((cause) => { if (isCurrent()) setResult({ review, draft, search, error: mapDomainError(cause) }) })
    return () => requests.current.invalidate()
  }, [draft, review, search, busy, unverified])
  return <section className="work-creation-review" aria-labelledby="work-creation-review-heading">
    <h3 id="work-creation-review-heading" ref={heading} tabIndex={-1}>Esta obra pode já estar na sua biblioteca</h3>
    <p>{review.candidates.length ? 'Encontramos uma obra que pode ser a mesma. Confira antes de continuar.' : 'Pesquise um título ou nome alternativo para conferir sua biblioteca.'}</p>
    {failure && <div className="metadata-error" role="alert">
      <p><strong>Não foi possível concluir a operação.</strong> Nenhum sucesso foi confirmado.</p>
      <p>{mapDomainError(failure.error)}</p>
      {unverified ? <><p>Não foi possível verificar a situação atual. Consulte novamente antes de confirmar ou volte aos dados.</p><Button disabled={busy} onClick={onRetry}>Consultar novamente</Button></> : <p>A revisão foi atualizada. Confira as opções antes de continuar.</p>}
    </div>}
    <label className="field"><span>Pesquisar na biblioteca</span><input type="search" value={query} disabled={busy || unverified} onChange={(event) => setQuery(event.target.value)} placeholder="Título ou nome alternativo" /></label>
    <div className="work-creation-review__results" aria-busy={searching} aria-live="polite">
      {searching && <p role="status">Pesquisando…</p>}
      {error && <p role="alert">{error}</p>}
      {!searching && !display.candidates.length && <p>Nenhuma correspondência encontrada. Você pode continuar com uma nova obra.</p>}
      {display.candidates.map((candidate) => <article key={candidate.work.id} className="work-creation-review__candidate">
        <WorkCover work={candidate.work} compact cacheOnly />
        <div className="work-creation-review__copy"><strong>{candidate.work.title}</strong>
          <p>{candidate.work.lastReadChapter ? `Cap. ${candidate.work.lastReadChapter.label}` : 'Sem progresso registrado'}{candidate.work.deletedAt ? ' · Na Lixeira' : ''}</p>
          {candidate.sources.length > 0 && <p className="work-creation-review__sources">Fontes: {candidate.sources.map((source) => source.name || source.domain).join(' · ')}</p>}
          {candidate.identityConflict && <p>Os identificadores são diferentes. Nenhuma associação será feita.</p>}
          {candidate.reasons.includes('source') && <p>Esta página já pertence a esta obra.</p>}
          <div className="url-preview-actions">
            <Button disabled={busy} onClick={() => onOpen(candidate.work.id)}>Abrir existente</Button>
            {!unverified && candidate.canAddSource && <Button disabled={actionsBlocked} onClick={() => onAddSource(candidate.work.id)}>Adicionar como fonte</Button>}
          </div>
        </div>
      </article>)}
    </div>
    {!display.canKeepSeparate && <p>Já existe uma correspondência de identidade. Abra a obra ou revise os dados antes de continuar.</p>}
    {!unverified && display.canKeepSeparate && <Button variant="primary" disabled={actionsBlocked} onClick={() => onKeepSeparate(display.candidates.map((candidate) => candidate.work.id))}>{busy ? 'Adicionando…' : display.candidates.length ? 'Manter separada' : 'Criar nova obra'}</Button>}
  </section>
}
