import { useEffect, useState } from 'react'
import type { Collection, Tag, UserStatus } from '@shared/contracts'
import { Button } from '../ui/Button'
import { ConfirmDialog, Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { mapDomainError, STATUS_LABELS } from '../../lib/format'
import { KeyboardMenu } from '../ui/KeyboardMenu'

type DialogKind = 'status' | 'tag' | 'collection' | 'trash' | null

interface Props {
  selectedIds: ReadonlySet<string>
  resultIds: string[]
  onSelectAll(): void
  onClear(): void
  onExit(): void
  onApplied(affectedIds: string[]): void
  currentCollection?: { id: string; name: string }
}

export function LibraryBulkActions({ selectedIds, resultIds, onSelectAll, onClear, onExit, onApplied, currentCollection }: Props) {
  const { showToast } = useToast()
  const workIds = [...selectedIds]
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [status, setStatus] = useState<UserStatus>('reading')
  const [tags, setTags] = useState<Tag[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [tagId, setTagId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [busy, setBusy] = useState(false)
  const disabled = workIds.length === 0 || busy

  useEffect(() => {
    let active = true
    void Promise.all([window.auri.tags.list(), window.auri.collections.list()])
      .then(([nextTags, nextCollections]) => {
        if (!active) return
        setTags(nextTags)
        setCollections(nextCollections)
        setTagId((current) => current || nextTags[0]?.id || '')
        setCollectionId((current) => current || nextCollections[0]?.id || '')
      })
      .catch(() => {
        if (active) showToast({ kind: 'error', message: 'Não foi possível carregar tags e coleções.' })
      })
    return () => { active = false }
  }, [showToast])

  async function run(operation: () => Promise<{ affectedIds: string[] }>, success: string) {
    setBusy(true)
    try {
      const result = await operation()
      setDialog(null)
      onApplied(result.affectedIds)
      showToast({ kind: 'success', message: success })
    } catch (error) {
      showToast({ kind: 'error', message: mapDomainError(error) })
    } finally {
      setBusy(false)
    }
  }

  const countLabel = `${workIds.length} ${workIds.length === 1 ? 'selecionada' : 'selecionadas'}`

  return <>
    <div className="bulk-toolbar" aria-label="Ações para obras selecionadas">
      <strong>{countLabel}</strong>
      <Button variant="ghost" disabled={busy || resultIds.length === 0} onClick={onSelectAll}>Selecionar tudo</Button>
      <Button variant="ghost" disabled={disabled} onClick={onClear}>Limpar seleção</Button>
      <span className="bulk-toolbar__separator" />
      <Button disabled={disabled} onClick={() => setDialog('status')}>Status</Button>
      <Button disabled={disabled} onClick={() => setDialog('tag')}>Tags</Button>
      <Button disabled={disabled} onClick={() => setDialog('collection')}>Coleções</Button>
      {currentCollection && <Button disabled={disabled} onClick={() => void run(() => window.auri.bulk.removeCollection({ workIds, collectionId: currentCollection.id }), `${countLabel} removida de “${currentCollection.name}”.`)}>Remover desta coleção</Button>}
      <KeyboardMenu className="bulk-overflow" label="Mais ações"><button disabled={disabled} onClick={() => void run(() => window.auri.bulk.setFavorite({ workIds, favorite: true }), `${countLabel} como favorita.`)}>Favoritar</button><button disabled={disabled} onClick={() => void run(() => window.auri.bulk.setFavorite({ workIds, favorite: false }), `Favorito removido de ${countLabel}.`)}>Remover dos favoritos</button><button disabled={disabled} onClick={() => void run(() => window.auri.bulk.setHomeVisibility({ workIds, hiddenFromHome: true }), `${countLabel} ocultada da Home.`)}>Ocultar da Home</button><button disabled={disabled} onClick={() => void run(() => window.auri.bulk.setHomeVisibility({ workIds, hiddenFromHome: false }), `${countLabel} visível na Home.`)}>Mostrar na Home</button><button className="is-danger" disabled={disabled} onClick={() => setDialog('trash')}>Mover para a Lixeira</button></KeyboardMenu>
      <Button variant="ghost" disabled={busy} onClick={onExit}>Sair da seleção</Button>
    </div>

    <Dialog open={dialog === 'status'} title={`Alterar status de ${countLabel}`} description="Somente o status pessoal será alterado; progresso e publicação serão preservados." onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={() => void run(() => window.auri.bulk.setStatus({ workIds, userStatus: status }), `Status atualizado em ${countLabel}.`)}>Aplicar status</Button></>}>
      <Select label="Novo status" value={status} onChange={(value) => setStatus(value as UserStatus)} options={(Object.entries(STATUS_LABELS) as Array<[UserStatus, string]>).map(([value, label]) => ({ value, label }))} />
    </Dialog>

    <Dialog open={dialog === 'tag'} title={`Gerenciar tags de ${countLabel}`} description="Apenas a tag escolhida será adicionada ou removida; as outras permanecerão intactas." onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancelar</Button><Button disabled={busy || !tagId} onClick={() => void run(() => window.auri.bulk.removeTag({ workIds, tagId }), `Tag removida de ${countLabel}.`)}>Remover tag</Button><Button variant="primary" disabled={busy || !tagId} onClick={() => void run(() => window.auri.bulk.addTag({ workIds, tagId }), `Tag adicionada a ${countLabel}.`)}>Adicionar tag</Button></>}>
      {tags.length ? <Select label="Tag" value={tagId} onChange={setTagId} options={tags.map((tag) => ({ value: tag.id, label: tag.name }))} /> : <p className="inline-empty">Nenhuma tag cadastrada.</p>}
    </Dialog>

    <Dialog open={dialog === 'collection'} title={`Gerenciar coleções de ${countLabel}`} description="Apenas a coleção escolhida será adicionada ou removida; os outros vínculos permanecerão intactos." onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancelar</Button><Button disabled={busy || !collectionId} onClick={() => void run(() => window.auri.bulk.removeCollection({ workIds, collectionId }), `Coleção removida de ${countLabel}.`)}>Remover</Button><Button variant="primary" disabled={busy || !collectionId} onClick={() => void run(() => window.auri.bulk.addCollection({ workIds, collectionId }), `${countLabel} adicionada à coleção.`)}>Adicionar</Button></>}>
      {collections.length ? <Select label="Coleção" value={collectionId} onChange={setCollectionId} options={collections.map((collection) => ({ value: collection.id, label: collection.name }))} /> : <p className="inline-empty">Nenhuma coleção cadastrada.</p>}
    </Dialog>

    <ConfirmDialog open={dialog === 'trash'} title={`Mover ${countLabel} para a Lixeira?`} description="As obras, progresso, histórico, fontes, notas, tags e coleções serão preservados e poderão ser restaurados." confirmLabel="Mover para a Lixeira" danger busy={busy} onClose={() => setDialog(null)} onConfirm={() => run(() => window.auri.bulk.moveToTrash({ workIds }), `${countLabel} movida para a Lixeira.`)} />
  </>
}
