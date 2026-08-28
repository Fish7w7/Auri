import { useEffect, useState } from 'react'
import type { Source } from '@shared/contracts'
import { listEligibleReadingSources } from '../../lib/source-selection'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'

export function AlternativeSourceDialog({ open, sources, onClose, onOpen }: {
  open: boolean
  sources: Source[]
  onClose(): void
  onOpen(source: Source): Promise<boolean>
}) {
  const eligible = listEligibleReadingSources(sources)
  const [sourceId, setSourceId] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setSourceId(eligible[0]?.id ?? '') }, [open, eligible[0]?.id])
  const selected = eligible.find((source) => source.id === sourceId) ?? null

  async function confirm() {
    if (!selected) return
    setBusy(true)
    try { if (await onOpen(selected)) onClose() } finally { setBusy(false) }
  }

  return <Dialog open={open} title="Escolher outra fonte" description="Selecione outra fonte ativa para esta obra." onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !selected} onClick={() => void confirm()}>{busy ? 'Abrindo…' : 'Abrir fonte'}</Button></>}>
    <label className="field"><span>Fonte</span><Select label="Fonte alternativa" value={sourceId} onChange={setSourceId} options={eligible.map((source) => ({ value: source.id, label: source.name || source.domain }))} /></label>
  </Dialog>
}
