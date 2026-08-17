import { useState } from 'react'
import type { Work } from '@shared/contracts'
import { navigate } from '../app/navigation'
import { ConfirmDialog } from '../components/ui/Dialog'
import { useToast } from '../components/ui/Toast'
import { mapDomainError } from '../lib/format'

export function useWorkActions(refresh: () => void) {
  const { showToast } = useToast()
  const [trashTarget, setTrashTarget] = useState<Work | null>(null)
  const [busy, setBusy] = useState(false)

  async function favorite(work: Work) {
    try {
      await window.lumi.works.update({ id: work.id, favorite: !work.favorite })
      refresh()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
  }

  async function increment(work: Work) {
    try {
      const result = await window.lumi.progress.increment({ workId: work.id })
      if (!result.applied) {
        showToast({ kind: 'warning', message: 'Esta alteração precisa de confirmação.' })
        return
      }
      refresh()
      showToast({
        kind: 'success',
        message: `Progresso atualizado para ${result.progress.chapter?.label}.`,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            try {
              await window.lumi.progress.undo({ historyId: result.history.id })
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
      await window.lumi.works.trash({ workId: trashTarget.id })
      showToast({ kind: 'info', message: `“${trashTarget.title}” foi movida para a Lixeira.` })
      setTrashTarget(null); refresh()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
    finally { setBusy(false) }
  }

  return {
    handlers: {
      onOpen: (work: Work) => navigate(`/work/${work.id}`),
      onFavorite: (work: Work) => void favorite(work),
      onIncrement: (work: Work) => void increment(work),
      onTrash: (work: Work) => setTrashTarget(work)
    },
    dialog: <ConfirmDialog open={trashTarget !== null} title={trashTarget ? `Mover “${trashTarget.title}” para a Lixeira?` : 'Mover para a Lixeira?'} description="A obra e todos os seus dados serão preservados e poderão ser restaurados." confirmLabel="Mover para a Lixeira" busy={busy} onConfirm={confirmTrash} onClose={() => setTrashTarget(null)} />
  }
}

