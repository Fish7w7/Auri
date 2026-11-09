import { useEffect, useState } from 'react'
import type { CoverResult, Work } from '@shared/contracts'

type CoverWork = Pick<Work, 'id' | 'title'> & Partial<Pick<Work, 'cover'>>
const PLACEHOLDER: CoverResult = { state: 'placeholder', dataUrl: null, source: 'none', cached: false }

export function WorkCover({ work, compact = false, cacheOnly = !work.cover, fallbackToInitial = cacheOnly }: {
  work: CoverWork
  compact?: boolean
  cacheOnly?: boolean
  fallbackToInitial?: boolean
}) {
  const initial = work.title.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'L'
  const [cover, setCover] = useState(PLACEHOLDER)
  useEffect(() => {
    let revision = 0
    async function load() {
      const request = ++revision
      setCover(PLACEHOLDER)
      try {
        const result = await window.auri.covers.get({ workId: work.id, cacheOnly })
        if (request === revision) setCover(result)
      } catch {
        if (request === revision) setCover({ ...PLACEHOLDER, state: 'error' })
      }
    }

    void load()
    window.addEventListener('auri:cover-cache-changed', load)
    return () => {
      revision++
      window.removeEventListener('auri:cover-cache-changed', load)
    }
  }, [cacheOnly, work.cover?.customPath, work.cover?.sourceUrl, work.cover?.type, work.id])

  function handleImageError() {
    setCover((current) => current === cover ? { ...current, state: 'error', dataUrl: null } : current)
  }

  const state = fallbackToInitial && cover.state === 'error' ? 'placeholder' : cover.state
  return (
    <div className={`work-cover work-cover--${state} ${compact ? 'work-cover--compact' : ''}`} aria-label={`Capa de ${work.title}`} aria-busy={!cacheOnly && !!work.cover && work.cover.type !== 'none' && state === 'placeholder'}>
      {cover.dataUrl
        ? <img src={cover.dataUrl} alt="" onError={handleImageError} />
        : <span>{state === 'error' ? '!' : initial}</span>}
      <i aria-hidden="true" />
    </div>
  )
}
