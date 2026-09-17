import { useEffect, useRef, useState } from 'react'
import type { Work, WorkMergeConflictField, WorkMergePreview } from '@shared/contracts'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { formatChapter, mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { WorkCover } from './WorkCover'

export function createDefaultMergeChoices(preview: WorkMergePreview): Partial<Record<WorkMergeConflictField, string>> {
  return Object.fromEntries(preview.conflicts.map((conflict) => [conflict.field, conflict.defaultWorkId]))
}

export function canExecuteMerge(preview: WorkMergePreview | null, choices: Partial<Record<WorkMergeConflictField, string>>): boolean {
  return Boolean(preview && preview.blockers.length === 0 && preview.conflicts.every((conflict) => choices[conflict.field]))
}

export function nextMergePrimaryId(currentPrimaryId: string, currentWorkId: string, otherWorkId: string): string {
  return currentPrimaryId === currentWorkId ? otherWorkId : currentWorkId
}

export function WorkMergeDialog({ open, currentWork, initialOtherWork = null, onClose, onMerged }: {
  open: boolean
  currentWork: Work
  initialOtherWork?: Work | null
  onClose(): void
  onMerged(primaryWorkId: string): void
}) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query)
  const [results, setResults] = useState<Work[]>([])
  const [otherWork, setOtherWork] = useState<Work | null>(initialOtherWork)
  const [primaryId, setPrimaryId] = useState(currentWork.id)
  const [preview, setPreview] = useState<WorkMergePreview | null>(null)
  const [choices, setChoices] = useState<Partial<Record<WorkMergeConflictField, string>>>({})
  const [preferredSourceId, setPreferredSourceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setQuery('')
    setResults([])
    setOtherWork(initialOtherWork)
    setPrimaryId(currentWork.id)
    setPreview(null)
    setChoices({})
    setPreferredSourceId(null)
    setLoading(false)
    setBusy(false)
    setError(null)
    busyRef.current = false
    if (initialOtherWork) {
      setLoading(true)
      void window.auri.works.previewMerge({
        primaryWorkId: currentWork.id,
        secondaryWorkId: initialOtherWork.id
      }).then((next) => {
        if (!active) return
        setPreview(next)
        setChoices(createDefaultMergeChoices(next))
        setPreferredSourceId(next.defaultPreferredSourceId)
      }).catch((cause) => { if (active) setError(mapDomainError(cause)) })
        .finally(() => { if (active) setLoading(false) })
    }
    return () => { active = false }
  }, [currentWork.id, initialOtherWork, open])

  useEffect(() => {
    if (!open || otherWork) return
    let active = true
    setLoading(true)
    void window.auri.library.query({ search: debouncedQuery.trim() || undefined, sort: 'title_asc', limit: 20 })
      .then((works) => { if (active) setResults(works.filter((work) => work.id !== currentWork.id)) })
      .catch((cause) => { if (active) setError(mapDomainError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [currentWork.id, debouncedQuery, open, otherWork])

  const loadPreview = async (nextPrimaryId: string, selected: Work) => {
    setLoading(true)
    setError(null)
    try {
      const next = await window.auri.works.previewMerge({
        primaryWorkId: nextPrimaryId,
        secondaryWorkId: nextPrimaryId === currentWork.id ? selected.id : currentWork.id
      })
      setPrimaryId(nextPrimaryId)
      setPreview(next)
      setChoices(createDefaultMergeChoices(next))
      setPreferredSourceId(next.defaultPreferredSourceId)
    } catch (cause) {
      setError(mapDomainError(cause))
    } finally {
      setLoading(false)
    }
  }

  const selectWork = (work: Work) => {
    setOtherWork(work)
    void loadPreview(currentWork.id, work)
  }

  const swap = () => {
    if (!otherWork || !preview) return
    const nextPrimaryId = nextMergePrimaryId(primaryId, currentWork.id, otherWork.id)
    void loadPreview(nextPrimaryId, otherWork)
  }

  const merge = async () => {
    if (!preview || !canExecuteMerge(preview, choices) || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await window.auri.works.merge({
        primaryWorkId: preview.primary.id,
        secondaryWorkId: preview.secondary.id,
        fieldChoices: choices,
        preferredSourceId
      })
      onMerged(result.work.id)
    } catch (cause) {
      setError(mapDomainError(cause))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const footer = <>
    <Button disabled={busy} onClick={onClose}>Cancelar</Button>
    <Button variant="danger" disabled={busy || loading || !canExecuteMerge(preview, choices)} onClick={() => void merge()}>
      {busy ? 'Mesclando…' : 'Mesclar obras'}
    </Button>
  </>

  return <Dialog open={open} title="Mesclar obras" description="Combine duas entradas confirmadas como a mesma obra." size="large" busy={busy} error={error} onClose={onClose} footer={footer}>
    {!otherWork ? <div className="work-merge-picker">
      <section className="work-merge-current"><span>Obra atual</span><strong>{currentWork.title}</strong><small>{formatChapter(currentWork.lastReadChapter?.label)}</small></section>
      <label className="search-field"><span className="sr-only">Escolha a outra obra</span><span aria-hidden="true">⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Escolha a outra obra…" /></label>
      <div className="work-merge-results" aria-busy={loading || undefined}>
        {loading && !results.length && <p>Carregando obras…</p>}
        {!loading && !results.length && <p>Nenhuma outra obra encontrada.</p>}
        {results.map((work) => <button key={work.id} onClick={() => selectWork(work)}><WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{formatChapter(work.lastReadChapter?.label)}</small></span></button>)}
      </div>
    </div> : <div className="work-merge-preview">
      <div className="work-merge-pair">
        <MergeWorkCard eyebrow="Será mantida" work={preview?.primary ?? currentWork} />
        <Button icon="rotate" disabled={loading || busy} onClick={swap}>Trocar</Button>
        <MergeWorkCard eyebrow="Será incorporada" work={preview?.secondary ?? otherWork} />
      </div>
      {loading && <p className="work-merge-state">Atualizando prévia…</p>}
      {preview && !loading && <>
        <section className="work-merge-section"><h3>Será combinado automaticamente</h3><ul>{preview.automaticActions.map((action) => <li key={action}>{action}</li>)}</ul><div className="work-merge-totals">{Object.entries(preview.totals).map(([key, value]) => <span key={key}><strong>{value}</strong> {TOTAL_LABELS[key]}</span>)}</div></section>
        {preview.conflicts.length > 0 && <section className="work-merge-section"><h3>Precisa da sua escolha</h3>{preview.conflicts.map((conflict) => <fieldset key={conflict.field}><legend>{conflict.label}</legend><label><input type="radio" name={conflict.field} checked={choices[conflict.field] === preview.primary.id} onChange={() => setChoices((current) => ({ ...current, [conflict.field]: preview.primary.id }))} /><span>{conflict.primaryValue}<small>Obra mantida</small></span></label><label><input type="radio" name={conflict.field} checked={choices[conflict.field] === preview.secondary.id} onChange={() => setChoices((current) => ({ ...current, [conflict.field]: preview.secondary.id }))} /><span>{conflict.secondaryValue}<small>Outra obra</small></span></label></fieldset>)}</section>}
        {preview.preferredSourceOptions.length > 1 && <section className="work-merge-section"><h3>Fonte preferida</h3>{preview.preferredSourceOptions.map((source) => <label className="work-merge-source-choice" key={source.id}><input type="radio" name="preferred-source" checked={preferredSourceId === source.id} onChange={() => setPreferredSourceId(source.id)} />{source.name}</label>)}</section>}
        {preview.blockers.length > 0 && <section className="work-merge-blockers" role="alert"><strong>Resolva este conflito antes de mesclar.</strong>{preview.blockers.map((blocker) => <p key={`${blocker.code}:${blocker.message}`}>{blocker.message}</p>)}</section>}
        <p className="work-merge-warning">A obra “{preview.primary.title}” será mantida. “{preview.secondary.title}” será incorporada e deixará de existir separadamente.</p>
      </>}
    </div>}
  </Dialog>
}

function MergeWorkCard({ eyebrow, work }: { eyebrow: string; work: Work }) {
  return <article><span>{eyebrow}</span><strong>{work.title}</strong><small>{formatChapter(work.lastReadChapter?.label)}</small></article>
}

const TOTAL_LABELS: Record<string, string> = {
  sources: 'fontes', aliases: 'aliases', externalRefs: 'IDs externos', creators: 'creators',
  genres: 'gêneros', tags: 'tags', collections: 'coleções', history: 'eventos no histórico'
}
