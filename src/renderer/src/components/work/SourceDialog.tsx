import { useEffect, useState } from 'react'
import type { Source, Work } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
import { Select } from '../ui/Select'

const LANGUAGES = { 'pt-BR': 'Português', en: 'Inglês', es: 'Espanhol', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês', other: 'Outro' }

export function SourceDialog({ open, work, source, onClose, onSaved }: { open: boolean; work: Work; source?: Source | null; onClose(): void; onSaved(): void }) {
  const empty = { name: '', seriesUrl: '', lastReadUrl: '', language: 'pt-BR', group: '', preferred: false }
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  useEffect(() => { if (open) setForm(source ? { name: source.name ?? '', seriesUrl: source.seriesUrl ?? '', lastReadUrl: source.lastReadUrl ?? '', language: source.language ?? 'pt-BR', group: source.translatorGroup ?? '', preferred: source.isPreferred } : empty) }, [open, source?.id])
  async function save() {
    if (!form.seriesUrl.trim() && !form.lastReadUrl.trim()) return
    setBusy(true)
    try {
      const values = { name: form.name.trim() || null, language: form.language, seriesUrl: form.seriesUrl.trim() || null, lastReadUrl: form.lastReadUrl.trim() || null, translatorGroup: form.group.trim() || null }
      const saved = source ? await window.lumi.sources.update({ id: source.id, ...values }) : await window.lumi.sources.create({ workId: work.id, ...values, isPreferred: form.preferred })
      if (source && form.preferred && !source.isPreferred) await window.lumi.sources.setPreferred({ sourceId: saved.id })
      showToast({ kind: 'success', message: source ? 'Fonte atualizada.' : 'Fonte adicionada.' }); onSaved(); onClose()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }
  return <Dialog open={open} title={source ? 'Editar fonte' : 'Adicionar fonte'} onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || (!form.seriesUrl.trim() && !form.lastReadUrl.trim())} onClick={() => void save()}>{busy ? 'Salvando…' : source ? 'Salvar' : 'Adicionar'}</Button></>}><div className="form-grid"><label className="field"><span>Nome</span><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Opcional" /></label><label className="field"><span>Idioma</span><Select label="Idioma" value={form.language} onChange={(language) => setForm({ ...form, language })} options={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} /></label><label className="field field--wide"><span>URL da obra</span><input type="url" value={form.seriesUrl} onChange={(event) => setForm({ ...form, seriesUrl: event.target.value })} placeholder="https://scan.example/obra" /></label><label className="field field--wide"><span>Última URL usada</span><input type="url" value={form.lastReadUrl} onChange={(event) => setForm({ ...form, lastReadUrl: event.target.value })} /></label><label className="field"><span>Grupo de tradução</span><input value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={form.preferred} onChange={(event) => setForm({ ...form, preferred: event.target.checked })} /><span>Definir como preferida</span></label></div></Dialog>
}
