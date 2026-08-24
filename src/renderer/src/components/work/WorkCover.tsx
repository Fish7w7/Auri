import { useEffect, useState } from 'react'
import type { CoverResult, Work } from '@shared/contracts'

export function WorkCover({ work, compact = false }: { work: Work; compact?: boolean }) {
  const initial = work.title.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'L'
  const [cover, setCover] = useState<CoverResult>({ state: 'placeholder', dataUrl: null, source: 'none', cached: false })
  useEffect(() => {
    let active = true
    const load = () => { setCover({ state: 'placeholder', dataUrl: null, source: 'none', cached: false }); void window.auri.covers.get({ workId: work.id }).then((value) => { if (active) setCover(value) }).catch(() => { if (active) setCover({ state: 'error', dataUrl: null, source: 'none', cached: false }) }) }
    const cleared = () => load()
    load()
    window.addEventListener('auri:cover-cache-changed', cleared)
    return () => { active = false; window.removeEventListener('auri:cover-cache-changed', cleared) }
  }, [work.cover.customPath, work.cover.sourceUrl, work.cover.type, work.id])
  return (
    <div className={`work-cover work-cover--${cover.state} ${compact ? 'work-cover--compact' : ''}`} aria-label={`Capa de ${work.title}`} aria-busy={work.cover.type !== 'none' && cover.state === 'placeholder'}>
      {cover.dataUrl ? <img src={cover.dataUrl} alt="" /> : <span>{cover.state === 'error' ? '!' : initial}</span>}
      <i aria-hidden="true" />
    </div>
  )
}
