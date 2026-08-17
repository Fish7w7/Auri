import { useState } from 'react'
import type { Work } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'

export function CoverDialog({ open, work, onClose, onSaved }: { open: boolean; work: Work; onClose(): void; onSaved(): void }) {
  const [url, setUrl] = useState(work.cover.sourceUrl ?? '')
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  async function run(operation: () => Promise<unknown>, message: string) { setBusy(true); try { await operation(); showToast({ kind: 'success', message }); onSaved(); onClose() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) } }
  return <Dialog open={open} title="Alterar capa" description="Capas remotas são baixadas e convertidas com segurança pelo Lumi; o Renderer nunca acessa a URL diretamente. Arquivos personalizados ficam nos assets permanentes." onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}><div className="cover-manager"><div><label className="field"><span>URL remota</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label><Button disabled={busy || !url.trim()} onClick={() => void run(() => window.lumi.assets.setRemoteCover({ workId: work.id, url: url.trim() }), 'URL salva; a thumbnail será criada sob demanda.')}>Usar URL</Button></div><div><strong>Arquivo personalizado</strong><p>PNG, JPG, JPEG ou WebP, até 15 MB.</p><Button disabled={busy} onClick={async () => { setBusy(true); try { const selected = await window.lumi.assets.selectCover({ workId: work.id }); if (selected) { showToast({ kind: 'success', message: 'Capa personalizada atualizada.' }); onSaved(); onClose() } } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) } }}>Escolher arquivo</Button></div>{work.cover.type !== 'none' && <div className="cover-manager__remove"><strong>Remover capa atual</strong><Button variant="danger" disabled={busy} onClick={() => void run(() => window.lumi.assets.removeCover({ workId: work.id }), 'Capa removida.')}>Remover capa</Button></div>}</div></Dialog>
}
