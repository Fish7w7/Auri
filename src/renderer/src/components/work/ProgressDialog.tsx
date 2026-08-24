import { useEffect, useState } from 'react'
import type { ProgressUpdateResult, Source, Work } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
import { Select } from '../ui/Select'

export function ProgressDialog({ open, work, sources, onClose, onSaved }: { open: boolean; work: Work; sources: Source[]; onClose(): void; onSaved(): void }) {
  const [chapter, setChapter] = useState(work.lastReadChapter?.label ?? '')
  const [sourceId, setSourceId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<ProgressUpdateResult & { applied: false } | null>(null)
  const { showToast } = useToast()
  useEffect(() => { if (open) { setChapter(work.lastReadChapter?.label ?? ''); setSourceId(''); setNote('') } }, [open, work.lastReadChapter?.label])

  async function submit(confirmSuspicious = false) {
    if (!chapter.trim()) return
    setBusy(true)
    try {
      const result = await window.auri.progress.update({ workId: work.id, chapterLabel: chapter, sourceId: sourceId || null, note: note.trim() || null, confirmSuspicious })
      if (!result.applied) { setConfirmation(result); return }
      showToast({ kind: 'success', message: `Progresso atualizado para ${result.progress.chapter?.label}.`, action: { label: 'Desfazer', onClick: async () => { await window.auri.progress.undo({ historyId: result.history.id }); onSaved(); showToast({ kind: 'info', message: 'Alteração desfeita.' }) } } })
      setConfirmation(null); onSaved(); onClose()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  return <><Dialog open={open} title="Atualizar progresso" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !chapter.trim()} onClick={() => void submit()}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}><div className="form-grid"><label className="field field--wide"><span>Último capítulo concluído</span><input autoFocus value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="191.5, 10A ou Prólogo" /></label><label className="field field--wide"><span>Fonte usada <small>opcional</small></span><Select label="Fonte usada" value={sourceId} onChange={setSourceId} options={[{ value: '', label: 'Nenhuma fonte' }, ...sources.filter((source) => source.status !== 'archived').map((source) => ({ value: source.id, label: source.name || source.domain }))]} /></label><label className="field field--wide"><span>Nota desta leitura</span><textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Onde terminou esta leitura?" /></label></div></Dialog>
    <Dialog open={confirmation !== null} title={confirmation?.reason === 'regression' ? 'Isso reduzirá seu progresso registrado.' : 'Este é um salto grande de progresso.'} description={`Seu progresso atual é ${confirmation?.progress.chapter?.label ?? 'não definido'} e você está alterando para ${confirmation?.requestedChapter.label ?? chapter}.`} onClose={() => setConfirmation(null)} footer={<><Button onClick={() => setConfirmation(null)}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={() => void submit(true)}>Atualizar mesmo assim</Button></>} />
  </>
}
