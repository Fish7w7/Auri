import { useCallback, useEffect, useState } from 'react'
import type { Collection } from '@shared/contracts'
import { navigate } from '../app/navigation'
import { useAppContext } from '../app/app-context'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/ui/Icon'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { mapDomainError } from '../lib/format'
import { LibraryPage } from './LibraryPage'

export function CollectionsPage({ collectionId }: { collectionId?: string }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Collection | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Collection | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const { refreshData } = useAppContext()
  const { showToast } = useToast()
  const load = useCallback(async () => {
    try { setCollections(await window.auri.collections.list()); setState('ready') }
    catch { setState('error') }
  }, [])
  useEffect(() => { void load() }, [load])

  const selected = collectionId ? collections.find((collection) => collection.id === collectionId) : undefined
  if (collectionId && state === 'loading') return <div className="page"><LoadingState label="Abrindo coleção…" /></div>
  if (collectionId && state === 'error') return <div className="page"><ErrorState title="Não foi possível abrir esta coleção." onRetry={() => void load()} /></div>
  if (collectionId && !selected) return <div className="page"><ErrorState title="Esta coleção não foi encontrada." onRetry={() => navigate('/collections')} /></div>
  if (selected) return <LibraryPage collectionId={selected.id} kicker="Coleção" title={selected.name} description={selected.description ?? undefined} />

  const openEditor = (collection: Collection | 'new') => {
    setEditing(collection)
    setName(collection === 'new' ? '' : collection.name)
    setDescription(collection === 'new' ? '' : collection.description ?? '')
  }
  const save = async () => {
    if (!editing || !name.trim()) return
    setBusy(true)
    try {
      if (editing === 'new') await window.auri.collections.create({ name, description: description.trim() || null })
      else await window.auri.collections.update({ id: editing.id, name, description: description.trim() || null })
      const created = editing === 'new'
      setEditing(null)
      await load()
      refreshData()
      showToast({ kind: 'success', message: created ? 'Coleção criada.' : 'Coleção atualizada.' })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await window.auri.collections.delete({ collectionId: deleting.id })
      setDeleting(null)
      await load()
      refreshData()
      showToast({ kind: 'info', message: 'Coleção excluída. As obras foram preservadas.' })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
    finally { setBusy(false) }
  }

  return <div className="page collections-page">
    <header className="page-header"><div><span className="page-kicker">Organização pessoal</span><h1>Coleções</h1><p>Agrupe obras do seu jeito.</p></div><Button variant="primary" icon="plus" onClick={() => openEditor('new')}>Nova coleção</Button></header>
    {state === 'loading' && <LoadingState label="Carregando coleções…" />}
    {state === 'error' && <ErrorState title="Não foi possível carregar as coleções." onRetry={() => void load()} />}
    {state === 'ready' && collections.length === 0 && <EmptyState title="Nenhuma coleção ainda." description="Crie uma coleção para organizar obras sem alterar sua Biblioteca." action={<Button variant="primary" onClick={() => openEditor('new')}>Criar coleção</Button>} />}
    {state === 'ready' && collections.length > 0 && <div className="collections-list">{collections.map((collection) => <article className="collection-row" key={collection.id}><button className="collection-row__main" onClick={() => navigate(`/collections/${collection.id}`)}><span className="collection-row__copy"><strong>{collection.name}</strong><span>{collection.description || 'Sem descrição'}</span></span><span className="collection-row__count">{collection.workCount ?? 0} {(collection.workCount ?? 0) === 1 ? 'obra' : 'obras'}</span><Icon name="chevron-right" /></button><div className="collection-row__actions"><Button variant="ghost" onClick={() => openEditor(collection)}>Renomear</Button><Button variant="ghost" onClick={() => setDeleting(collection)}>Excluir</Button></div></article>)}</div>}
    <Dialog open={editing !== null} title={editing === 'new' ? 'Nova coleção' : 'Renomear coleção'} onClose={() => setEditing(null)} footer={<><Button onClick={() => setEditing(null)}>Cancelar</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}><div className="form-grid"><label className="field field--wide"><span>Nome *</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field field--wide"><span>Descrição</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label></div></Dialog>
    <ConfirmDialog open={deleting !== null} title={deleting ? `Excluir a coleção “${deleting.name}”?` : 'Excluir coleção?'} description="Somente a coleção e seus vínculos serão removidos. As obras continuarão na Biblioteca." confirmLabel="Excluir coleção" danger busy={busy} onClose={() => setDeleting(null)} onConfirm={remove} />
  </div>
}
