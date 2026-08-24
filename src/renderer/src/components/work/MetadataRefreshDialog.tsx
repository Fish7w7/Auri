import { useEffect, useState } from 'react'
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
  const { showToast } = useToast()
  const load = () => { setLoading(true); setError(''); void window.auri.metadata.previewRefresh({ workId }).then(setPreview).catch((reason) => setError(mapDomainError(reason))).finally(() => setLoading(false)) }
  useEffect(() => { if (open) load() }, [open, workId])
  async function apply() {
    setBusy(true)
    try {
      const result = await window.auri.metadata.applyRefresh({ workId })
      onSaved(); onClose()
      window.dispatchEvent(new Event('auri:cover-cache-changed'))
      showToast({ kind: result.warnings.length ? 'warning' : 'success', message: result.warnings[0] ?? 'Metadados atualizados.' })
    } catch (reason) { showToast({ kind: 'error', message: mapDomainError(reason) }) } finally { setBusy(false) }
  }
  return <Dialog open={open} title="Atualizar metadados" description="Confira as mudanças antes de aplicá-las. Campos editados por você continuam protegidos." onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || loading || !!error || !preview?.changes.some((change) => !change.protected)} onClick={() => void apply()}>{busy ? 'Atualizando…' : 'Aplicar mudanças'}</Button></>}>
    {loading && <div className="metadata-skeleton" role="status"><i /><i /><i /></div>}
    {error && <div className="metadata-error" role="alert"><p>{error}</p><Button onClick={load}>Tentar novamente</Button></div>}
    {preview && !loading && <div className="metadata-refresh">{preview.changes.length === 0 ? <p className="metadata-hint">Os metadados já estão atualizados.</p> : preview.changes.map((change) => <article key={change.field} className={change.protected ? 'is-protected' : ''}><header><strong>{change.label}</strong>{change.protected && <span>Protegido</span>}</header><div><p><small>Atual</small>{change.current || '—'}</p><b aria-hidden="true">→</b><p><small>AniList</small>{change.incoming || '—'}</p></div></article>)}</div>}
  </Dialog>
}
