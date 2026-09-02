import { useState } from 'react'
import type { Work } from '@shared/contracts'
import { navigate } from '../app/navigation'
import { ConfirmDialog } from '../components/ui/Dialog'
import { useToast } from '../components/ui/Toast'
import { mapDomainError } from '../lib/format'

export function useWorkActions(refresh: () => void, onOpen: (work: Work) => void = (work) => navigate(`/work/${work.id}`)) {
  const { showToast } = useToast()
  const [trashTarget, setTrashTarget] = useState<Work | null>(null)
  const [busy, setBusy] = useState(false)

  async function favorite(work: Work) {
    try {
      await window.auri.works.update({ id: work.id, favorite: !work.favorite })
      refresh()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
  }

  async function increment(work: Work) {
    try {
      const result = await window.auri.progress.increment({ workId: work.id })
      if (!result.applied) {
        showToast({ kind: 'warning', message: 'Esta alteração precisa de confirmação.' })
        return
      }
      refresh()
      showToast({
        kind: 'success',
        message: `Progresso atualizado para ${result.progress.chapter?.label}.`,
        dedupeKey: `progress:${work.id}`,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            try {
              await window.auri.progress.undo({ historyId: result.history.id })
              refresh()
              showToast({ kind: 'info', message: 'Alteração desfeita.' })
            } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
          }
        }
      })
    } catch (error) { showToast({ kind: 'warning', message: mapDomainError(error) }) }
  }

  async function confirmTrash() {
    if (!trashTarget) return
    setBusy(true)
    try {
      await window.auri.works.trash({ workId: trashTarget.id })
      showToast({ kind: 'info', message: `“${trashTarget.title}” foi movida para a Lixeira.` })
      setTrashTarget(null); refresh()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
    finally { setBusy(false) }
  }

  return {
    handlers: {
      onOpen,
      onFavorite: (work: Work) => void favorite(work),
      onIncrement: (work: Work) => void increment(work),
      onTrash: (work: Work) => setTrashTarget(work)
    },
    dialog: <ConfirmDialog open={trashTarget !== null} title="Mover para a Lixeira?" context={trashTarget ? <strong>{trashTarget.title}</strong> : undefined} description="A obra poderá ser restaurada depois. Seu progresso, histórico, fontes e notas serão preservados." confirmLabel="Mover para a Lixeira" danger busy={busy} onConfirm={confirmTrash} onClose={() => setTrashTarget(null)} />
  }
}
