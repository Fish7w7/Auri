import { useEffect, useMemo, useState } from 'react'
import type { DetailedUpdateWorkRequest, WorkDetails } from '@shared/contracts'
import { mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useToast } from '../ui/Toast'
import { WorkForm, splitNames, type WorkFormState } from './WorkForm'
import { useShortcutScope } from '../../app/keyboard-shortcuts'

function fromDetails(details: WorkDetails): WorkFormState {
  const { work } = details
  return {
    title: work.title, mediaType: work.mediaType, userStatus: work.userStatus, publicationStatus: work.publicationStatus ?? '',
    description: work.description ?? '', countryCode: work.countryCode ?? '', startDate: work.startDate ?? '', endDate: work.endDate ?? '',
    chapter: work.lastReadChapter?.label ?? '', rating: work.rating?.toString() ?? '', favorite: work.favorite,
    notes: work.notes ?? '', lastReadNote: work.lastReadNote ?? '',
    aliases: details.aliases.map((alias) => ({ name: alias.name, kind: alias.kind ?? 'alternative' })),
    creators: details.creators.map((creator) => ({ name: creator.name, role: creator.role as WorkFormState['creators'][number]['role'] })),
    genres: details.genres.map((genre) => genre.name).join(', '), tags: details.tags.map((tag) => tag.name),
    collectionIds: details.collections.map((collection) => collection.id), sourceName: '', sourceUrl: '', sourceLastUrl: '',
    sourceLanguage: 'pt-BR', sourceGroup: '', sourcePreferred: false,
    coverMode: work.cover.type, coverUrl: work.cover.sourceUrl ?? ''
  }
}

type EditorCoverApi = Pick<typeof window.lumi.assets, 'removeCover' | 'setRemoteCover' | 'selectCover'>
export type EditorCoverResult = 'unchanged' | 'applied' | 'cancelled'

export async function applyEditorCoverChange(workId: string, form: WorkFormState, initial: WorkFormState, assets: EditorCoverApi): Promise<EditorCoverResult> {
  if (form.coverMode === initial.coverMode && form.coverUrl === initial.coverUrl) return 'unchanged'
  if (form.coverMode === 'none') { await assets.removeCover({ workId }); return 'applied' }
  if (form.coverMode === 'remote') {
    if (!form.coverUrl.trim()) throw new Error('Informe a URL da capa remota.')
    await assets.setRemoteCover({ workId, url: form.coverUrl.trim() })
    return 'applied'
  }
  return await assets.selectCover({ workId }) ? 'applied' : 'cancelled'
}

export function WorkEditorDialog({ open, details, onClose, onSaved }: { open: boolean; details: WorkDetails; onClose(): void; onSaved(): void }) {
  const initial = useMemo(() => fromDetails(details), [details])
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const { showToast } = useToast()
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useEffect(() => { void window.lumi.updates.setDirty({ scope: 'work-editor', dirty: open && dirty }) }, [dirty, open])
  useEffect(() => () => { void window.lumi.updates.setDirty({ scope: 'work-editor', dirty: false }) }, [])
  const requestClose = () => dirty ? setConfirmClose(true) : onClose()

  async function save() {
    if (!form.title.trim()) return
    setBusy(true)
    let persistedChanges = false
    try {
      const workPatch: Record<string, unknown> = { id: details.work.id }
      const core: Array<[keyof WorkFormState, string, unknown]> = [
        ['title', 'title', form.title], ['mediaType', 'mediaType', form.mediaType], ['userStatus', 'userStatus', form.userStatus],
        ['publicationStatus', 'publicationStatus', form.publicationStatus || null], ['description', 'description', form.description.trim() || null],
        ['countryCode', 'countryCode', form.countryCode.trim() || null], ['startDate', 'startDate', form.startDate.trim() || null],
        ['endDate', 'endDate', form.endDate.trim() || null], ['rating', 'rating', form.rating === '' ? null : Number(form.rating)],
        ['favorite', 'favorite', form.favorite], ['notes', 'notes', form.notes.trim() || null], ['lastReadNote', 'lastReadNote', form.lastReadNote.trim() || null]
      ]
      for (const [formKey, requestKey, next] of core) if (JSON.stringify(form[formKey]) !== JSON.stringify(initial[formKey])) workPatch[requestKey] = next
      const aliasesChanged = JSON.stringify(form.aliases) !== JSON.stringify(initial.aliases)
      const creatorsChanged = JSON.stringify(form.creators) !== JSON.stringify(initial.creators)
      const genresChanged = form.genres !== initial.genres
      const detailsChanged = Object.keys(workPatch).length > 1 || aliasesChanged || creatorsChanged || genresChanged
      if (detailsChanged) {
        await window.lumi.works.updateDetailed({
          work: workPatch as DetailedUpdateWorkRequest['work'],
          ...(aliasesChanged ? { aliases: form.aliases.filter((item) => item.name.trim()).map((item) => ({ ...item, source: 'user' })) } : {}),
          ...(creatorsChanged ? { creators: form.creators.filter((item) => item.name.trim()).map((item) => ({ ...item, source: 'user' })) } : {}),
          ...(genresChanged ? { genres: splitNames(form.genres) } : {})
        })
        persistedChanges = true
      }
      const previousTags = new Map(details.tags.map((tag) => [tag.name.toLocaleLowerCase('pt-BR'), tag]))
      const nextTags = new Set(form.tags.map((tag) => tag.toLocaleLowerCase('pt-BR')))
      for (const tag of details.tags) if (!nextTags.has(tag.name.toLocaleLowerCase('pt-BR'))) { await window.lumi.tags.removeFromWork({ workId: details.work.id, tagId: tag.id }); persistedChanges = true }
      for (const tag of form.tags) if (!previousTags.has(tag.toLocaleLowerCase('pt-BR'))) { await window.lumi.tags.create({ workId: details.work.id, name: tag }); persistedChanges = true }
      const previousCollections = new Set(details.collections.map((collection) => collection.id))
      const nextCollections = new Set(form.collectionIds)
      for (const id of previousCollections) if (!nextCollections.has(id)) { await window.lumi.collections.removeWork({ workId: details.work.id, collectionId: id }); persistedChanges = true }
      for (const id of nextCollections) if (!previousCollections.has(id)) { await window.lumi.collections.addWork({ workId: details.work.id, collectionId: id }); persistedChanges = true }
      const coverResult = await applyEditorCoverChange(details.work.id, form, initial, window.lumi.assets)
      if (coverResult === 'cancelled') {
        if (persistedChanges) {
          showToast({ kind: 'info', message: 'As demais alterações foram salvas; a troca de capa foi cancelada.' })
          onSaved(); onClose()
        }
        return
      }
      showToast({ kind: 'success', message: 'Alterações da obra salvas.' })
      onSaved(); onClose()
    } catch (error) {
      if (persistedChanges) {
        showToast({ kind: 'warning', message: `Parte das alterações foi salva, mas não foi possível concluir: ${mapDomainError(error)}` })
        onSaved(); onClose()
      } else showToast({ kind: 'error', message: mapDomainError(error) })
    } finally { setBusy(false) }
  }

  useShortcutScope({ save: () => void save(), canSave: open && dirty && !busy && !confirmClose && Boolean(form.title.trim()) })

  return <><Dialog open={open} title={`Editar ${details.work.title}`} description="Os metadados editados manualmente ficarão protegidos de futuras sincronizações." onClose={requestClose} footer={<><Button onClick={requestClose}>Cancelar</Button><Button variant="primary" disabled={busy || !dirty || !form.title.trim()} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar alterações'}</Button></>}><WorkForm value={form} onChange={setForm} collections={details.allCollections} includeProgress={false} includeSource={false} /></Dialog>
    <Dialog open={confirmClose} title="Você possui alterações não salvas." onClose={() => setConfirmClose(false)} footer={<><Button variant="danger" onClick={onClose}>Descartar</Button><Button onClick={() => setConfirmClose(false)}>Continuar editando</Button><Button variant="primary" disabled={busy} onClick={() => { setConfirmClose(false); void save() }}>Salvar</Button></>} /></>
}
