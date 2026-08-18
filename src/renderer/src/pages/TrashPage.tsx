import { useCallback, useEffect, useState } from 'react'
import type { Work } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { WorkCover } from '../components/work/WorkCover'
import { formatRelativeDate, mapDomainError } from '../lib/format'

export function TrashPage() {
  const { refreshData } = useAppContext()
  const { showToast } = useToast()
  const [works, setWorks] = useState<Work[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [target, setTarget] = useState<Work | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setWorks(await window.lumi.works.listTrash()); setState('ready') } catch { setState('error') } }, [])
  useEffect(() => { void load() }, [load])
  async function restore(work: Work) { try { await window.lumi.works.restore({ workId: work.id }); showToast({ kind: 'success', message: `“${work.title}” foi restaurado.` }); refreshData(); await load() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }
  async function permanentlyDelete() { if (!target) return; setBusy(true); try { await window.lumi.works.deletePermanently({ workId: target.id }); showToast({ kind: 'info', message: `“${target.title}” foi excluída permanentemente.` }); setTarget(null); refreshData(); await load() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) } }

  return <div className="page trash-page"><header className="page-header"><div><span className="page-kicker">Itens removidos</span><h1>Lixeira</h1><p>Restaure uma obra ou exclua seus dados definitivamente.</p></div></header>
    {state === 'loading' && <LoadingState />}{state === 'error' && <ErrorState title="Não foi possível abrir a Lixeira." onRetry={() => void load()} />}
    {state === 'ready' && works.length === 0 && <EmptyState title="A Lixeira está vazia." />}
    {state === 'ready' && works.length > 0 && <div className="trash-list">{works.map((work) => <article className="trash-item" key={work.id}><WorkCover work={work} compact /><div><h2>{work.title}</h2><p>Excluído {formatRelativeDate(work.deletedAt)}</p></div><div className="trash-item__actions"><Button icon="rotate" onClick={() => void restore(work)}>Restaurar</Button><Button className="button--danger-ghost" variant="ghost" icon="trash" onClick={() => setTarget(work)}>Excluir permanentemente</Button></div></article>)}</div>}
    <ConfirmDialog open={target !== null} title={target ? `Excluir “${target.title}” permanentemente?` : 'Excluir permanentemente?'} description="Esta ação apagará o progresso, histórico, fontes, notas e demais dados vinculados à obra. Esta ação não pode ser desfeita." confirmLabel="Excluir permanentemente" danger busy={busy} onConfirm={permanentlyDelete} onClose={() => setTarget(null)} />
  </div>
}
