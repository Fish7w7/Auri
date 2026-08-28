import { useEffect, useMemo, useState } from 'react'
import type { Collection, Work } from '@shared/contracts'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { mapDomainError } from '../../lib/format'
import { WorkCover } from '../work/WorkCover'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'

export function AddWorksToCollectionDialog({ open, collection, onClose, onAdded }: {
  open: boolean
  collection: Collection
  onClose(): void
  onAdded(): void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [works, setWorks] = useState<Work[]>([])
  const [existingIds, setExistingIds] = useState<Set<string>>(() => new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (!open) return
    setSearch('')
    setSelectedIds(new Set())
    setError(null)
    let active = true
    setLoading(true)
    void Promise.all([
      window.auri.library.query({ sort: 'title_asc' }),
      window.auri.library.query({ collectionIds: [collection.id] })
    ]).then(([allWorks, currentWorks]) => {
      if (!active) return
      setWorks(allWorks)
      setExistingIds(new Set(currentWorks.map((work) => work.id)))
    }).catch((cause) => {
      if (active) setError(mapDomainError(cause))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [collection.id, open])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    void window.auri.library.query({ search: debouncedSearch || undefined, sort: 'title_asc' })
      .then((next) => { if (active) setWorks(next) })
      .catch((cause) => { if (active) setError(mapDomainError(cause)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, open])

  const selectedCount = selectedIds.size
  const selectionLabel = useMemo(() => `${selectedCount} ${selectedCount === 1 ? 'selecionada' : 'selecionadas'}`, [selectedCount])
  const toggle = (workId: string) => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(workId)) next.delete(workId)
    else next.add(workId)
    return next
  })
  const add = async () => {
    if (!selectedCount) return
    setBusy(true)
    setError(null)
    try {
      await window.auri.bulk.addCollection({ workIds: [...selectedIds], collectionId: collection.id })
      showToast({ kind: 'success', message: `${selectionLabel} em “${collection.name}”.` })
      onAdded()
      onClose()
    } catch (cause) {
      setError(mapDomainError(cause))
    } finally {
      setBusy(false)
    }
  }

  return <Dialog
    open={open}
    title={`Adicionar obras a “${collection.name}”`}
    description="Pesquise na Biblioteca e escolha uma ou mais obras."
    onClose={onClose}
    busy={busy}
    error={error}
    footer={<><span className="collection-work-picker__count" aria-live="polite">{selectionLabel}</span><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !selectedCount} onClick={() => void add()}>{busy ? 'Adicionando…' : 'Adicionar'}</Button></>}
  >
    <div className="collection-work-picker">
      <label className="search-field collection-work-picker__search"><span className="sr-only">Pesquisar na Biblioteca</span><span aria-hidden="true">⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar na Biblioteca…" /></label>
      <div className="collection-work-picker__list" aria-busy={loading || undefined}>
        {loading && works.length === 0 && <p className="collection-work-picker__state">Carregando obras…</p>}
        {!loading && works.length === 0 && <p className="collection-work-picker__state">Nenhuma obra encontrada.</p>}
        {works.map((work) => {
          const alreadyAdded = existingIds.has(work.id)
          return <label className={alreadyAdded ? 'is-added' : ''} key={work.id}>
            <input type="checkbox" checked={alreadyAdded || selectedIds.has(work.id)} disabled={alreadyAdded || busy} onChange={() => toggle(work.id)} />
            <WorkCover work={work} compact />
            <span><strong>{work.title}</strong><small>{alreadyAdded ? 'Já está nesta coleção' : work.lastReadChapter ? `Cap. ${work.lastReadChapter.label}` : 'Sem progresso'}</small></span>
          </label>
        })}
      </div>
    </div>
  </Dialog>
}
