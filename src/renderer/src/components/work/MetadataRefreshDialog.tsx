import { useEffect, useRef, useState } from 'react'
import type { MetadataRefreshPreview } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'

export function MetadataRefreshDialog({ open, workId, onClose, onSaved }: { open: boolean; workId: string; onClose(): void; onSaved(): void }) {
  const [preview, setPreview] = useState<MetadataRefreshPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const { showToast } = useToast()
  const previewRequest = `metadata-refresh:preview:${workId}`
  const applyRequest = `metadata-refresh:apply:${workId}`
  const cancelPending = () => {
    requestId.current += 1
    void window.auri.metadata.cancel({ requestId: previewRequest })
    void window.auri.metadata.cancel({ requestId: applyRequest })
  }
  const close = () => { cancelPending(); onClose() }
  const load = () => {
    const id = ++requestId.current
    setLoading(true); setError('')
    void window.auri.metadata.previewRefresh({ workId, requestId: previewRequest })
      .then((next) => { if (id === requestId.current) setPreview(next) })
      .catch((reason) => { if (id === requestId.current) setError(mapDomainError(reason)) })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }
  useEffect(() => { if (open) load(); else cancelPending(); return cancelPending }, [open, workId])
  async function apply() {
    const id = ++requestId.current
    setBusy(true)
    try {
      const result = await window.auri.metadata.applyRefresh({ workId, requestId: applyRequest })
      if (id !== requestId.current) return
      onSaved(); close()
      window.dispatchEvent(new Event('auri:cover-cache-changed'))
      showToast({ kind: result.warnings.length ? 'warning' : 'success', message: result.warnings[0] ?? 'Metadados atualizados.' })
    } catch (reason) { if (id === requestId.current) showToast({ kind: 'error', message: mapDomainError(reason) }) } finally { if (id === requestId.current) setBusy(false) }
  }
  return <Dialog open={open} title="Atualizar metadados" description="Confira as mudanças antes de aplicá-las. Campos editados por você continuam protegidos." onClose={close} footer={<><Button onClick={close}>Cancelar</Button><Button variant="primary" disabled={busy || loading || !!error || !preview?.changes.some((change) => !change.protected)} onClick={() => void apply()}>{busy ? 'Atualizando…' : 'Aplicar mudanças'}</Button></>}>
    {loading && <div className="metadata-skeleton" role="status"><i /><i /><i /></div>}
    {error && <div className="metadata-error" role="alert"><p>{error}</p><Button onClick={load}>Tentar novamente</Button></div>}
    {preview && !loading && <div className="metadata-refresh">{preview.changes.length === 0 ? <p className="metadata-hint">Os metadados já estão atualizados.</p> : preview.changes.map((change) => <article key={change.field} className={change.protected ? 'is-protected' : ''}><header><strong>{change.label}</strong>{change.protected && <span>Protegido</span>}</header><div><p><small>Atual</small>{change.current || '—'}</p><b aria-hidden="true">→</b><p><small>AniList</small>{change.incoming || '—'}</p></div></article>)}</div>}
  </Dialog>
}
