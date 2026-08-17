import { useEffect, useState } from 'react'
import type { Work } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
import { Select } from '../ui/Select'

export type RelationKind = 'alias' | 'creator' | 'genre' | 'tag' | 'collection'
const TITLES: Record<RelationKind, string> = { alias: 'Adicionar título alternativo', creator: 'Adicionar creator', genre: 'Adicionar gênero', tag: 'Adicionar tag', collection: 'Nova coleção' }

export function RelationDialog({ open, kind, work, onClose, onSaved }: { open: boolean; kind: RelationKind; work: Work; onClose(): void; onSaved(): void }) {
  const [name, setName] = useState('')
  const [secondary, setSecondary] = useState(kind === 'creator' ? 'author' : kind === 'alias' ? 'alternative' : '')
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  useEffect(() => { if (open) { setName(''); setSecondary(kind === 'creator' ? 'author' : kind === 'alias' ? 'alternative' : '') } }, [kind, open])
  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (kind === 'alias') await window.lumi.aliases.create({ workId: work.id, name, kind: secondary, source: 'user' })
      if (kind === 'creator') await window.lumi.creators.create({ workId: work.id, name, role: secondary as 'author', source: 'user' })
      if (kind === 'genre') await window.lumi.genres.create({ workId: work.id, name })
      if (kind === 'tag') await window.lumi.tags.create({ workId: work.id, name })
      if (kind === 'collection') await window.lumi.collections.create({ workId: work.id, name, description: secondary.trim() || null })
      showToast({ kind: 'success', message: kind === 'collection' ? 'Coleção criada e associada.' : 'Informação adicionada.' }); onSaved(); onClose()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }
  return <Dialog open={open} title={TITLES[kind]} onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Salvando…' : kind === 'collection' ? 'Criar' : 'Adicionar'}</Button></>}><div className="form-grid"><label className="field field--wide"><span>{kind === 'creator' ? 'Nome' : kind === 'collection' ? 'Nome *' : kind === 'alias' ? 'Título' : 'Nome'}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>{kind === 'alias' && <label className="field field--wide"><span>Tipo</span><Select label="Tipo do título" value={secondary} onChange={setSecondary} options={[{ value: 'alternative', label: 'Alternativo' }, { value: 'original', label: 'Original' }, { value: 'localized', label: 'Localizado' }]} /></label>}{kind === 'creator' && <label className="field field--wide"><span>Função</span><Select label="Função do creator" value={secondary} onChange={setSecondary} options={[{ value: 'author', label: 'Autor' }, { value: 'artist', label: 'Artista' }, { value: 'story', label: 'História' }, { value: 'original_creator', label: 'Criador original' }, { value: 'other', label: 'Outro' }]} /></label>}{kind === 'collection' && <label className="field field--wide"><span>Descrição</span><textarea rows={3} value={secondary} onChange={(event) => setSecondary(event.target.value)} /></label>}</div></Dialog>
}
