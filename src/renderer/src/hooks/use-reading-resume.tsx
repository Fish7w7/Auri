import { useRef, useState } from 'react'
import type { Source } from '@shared/contracts'
import { AlternativeSourceDialog } from '../components/work/AlternativeSourceDialog'
import { useToast } from '../components/ui/Toast'
import { listEligibleReadingSources, openReadingSource, selectResumeSource } from '../lib/source-selection'
import { mapDomainError } from '../lib/format'

export function useReadingResume(refresh: () => void) {
  const { showToast } = useToast()
  const [alternatives, setAlternatives] = useState<Source[]>([])
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function openSource(source: Source, availableSources: readonly Source[] = []): Promise<boolean> {
    try {
      await openReadingSource(source, {
        openExternal: (url) => window.auri.shell.openExternal({ url }),
        markUsed: (sourceId) => window.auri.sources.markUsed({ sourceId })
      })
      refresh()
      return true
    } catch {
      const otherSources = listEligibleReadingSources(availableSources).filter((candidate) => candidate.id !== source.id)
      showToast({
        kind: 'error',
        message: 'Não foi possível concluir a retomada nesta fonte.',
        ...(otherSources.length ? { action: { label: 'Escolher outra', onClick: () => setAlternatives(otherSources) } } : {})
      })
      return false
    }
  }

  async function withSources(workId: string, onMissing: () => void, choose: boolean) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const sources = await window.auri.sources.list({ workId })
      const primary = selectResumeSource(sources)
      if (!primary) {
        onMissing()
        return
      }
      if (!choose) {
        await openSource(primary, sources)
        return
      }
      const otherSources = listEligibleReadingSources(sources).filter((source) => source.id !== primary.id)
      if (otherSources.length) setAlternatives(otherSources)
      else showToast({ kind: 'info', message: 'Esta obra tem apenas uma fonte ativa com endereço válido.' })
    } catch (error) {
      showToast({ kind: 'error', message: mapDomainError(error) })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return {
    busy,
    openSource,
    open: (workId: string, onMissing: () => void) => withSources(workId, onMissing, false),
    choose: (workId: string, onMissing: () => void) => withSources(workId, onMissing, true),
    dialog: <AlternativeSourceDialog open={alternatives.length > 0} sources={alternatives}
      onClose={() => setAlternatives([])} onOpen={(source) => openSource(source)} />
  }
}
