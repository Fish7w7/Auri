import { useEffect, useRef, useState } from 'react'
import type { Work } from '@shared/contracts'
import { navigate } from '../../app/navigation'
import { formatChapter, STATUS_LABELS } from '../../lib/format'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { WorkCover } from '../work/WorkCover'

export type QuickSearchPhase = 'idle' | 'loading' | 'empty' | 'results' | 'error'
export function getQuickSearchPhase(query: string, loading: boolean, resultCount: number, failed: boolean): QuickSearchPhase {
  if (failed) return 'error'
  if (loading) return 'loading'
  if (!query.trim()) return 'idle'
  return resultCount > 0 ? 'results' : 'empty'
}

export function QuickSearchDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Work[]>([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const request = useRef(0)

  useEffect(() => {
    if (!open) return
    setQuery(''); setResults([]); setActive(0); setLoading(false); setFailed(false); setRetry(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    const id = ++request.current
    if (!trimmed) { setResults([]); setLoading(false); setFailed(false); return }
    setLoading(true)
    setFailed(false)
    const timer = window.setTimeout(() => {
      void window.lumi.library.search({ query: trimmed }).then((items) => {
        if (request.current !== id) return
        setResults(items.slice(0, 8)); setActive(0); setLoading(false)
      }).catch(() => { if (request.current === id) { setResults([]); setLoading(false); setFailed(true) } })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [open, query, retry])

  const phase = getQuickSearchPhase(query, loading, results.length, failed)

  const openWork = (work: Work | undefined) => {
    if (!work) return
    onClose()
    navigate(`/work/${work.id}`)
  }

  return <Dialog open={open} title="Busca rápida" description="Pesquise apenas nas obras salvas na sua Biblioteca." onClose={onClose}>
    <div className="quick-search">
      <label className="quick-search__field"><span aria-hidden="true">⌕</span><input autoFocus role="combobox" aria-autocomplete="list" aria-expanded={results.length > 0} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setActive((value) => (value + 1) % results.length) }
        if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setActive((value) => (value - 1 + results.length) % results.length) }
        if (event.key === 'Enter') { event.preventDefault(); openWork(results[active]) }
      }} placeholder="Buscar títulos, aliases ou autores…" aria-label="Buscar na Biblioteca" aria-controls="quick-search-results" aria-activedescendant={results[active] ? `quick-result-${results[active].id}` : undefined} /><kbd>Esc</kbd></label>
      <div id="quick-search-results" className="quick-search__results" role="listbox" aria-label="Resultados da Biblioteca">
        {phase === 'loading' && <p className="quick-search__state">Pesquisando…</p>}
        {phase === 'empty' && <p className="quick-search__state">Nenhuma obra encontrada.</p>}
        {phase === 'idle' && <p className="quick-search__state">Digite para localizar uma obra.</p>}
        {phase === 'error' && <div className="quick-search__state" role="alert"><p>Não foi possível consultar a Biblioteca.</p><Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div>}
        {phase === 'results' && results.map((work, index) => <button id={`quick-result-${work.id}`} role="option" aria-selected={index === active} className={index === active ? 'is-active' : ''} key={work.id} onPointerMove={() => setActive(index)} onClick={() => openWork(work)}><WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{STATUS_LABELS[work.userStatus]} · {formatChapter(work.lastReadChapter?.label)}</small></span></button>)}
      </div>
      <footer className="quick-search__hint"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> fechar</span></footer>
    </div>
  </Dialog>
}
