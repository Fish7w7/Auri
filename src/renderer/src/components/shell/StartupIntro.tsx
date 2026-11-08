import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { APP_BRAND } from '@shared/constants/app-branding'
import { createIntroScene, INTRO_PLAY_MS } from './startup-cinematography'
import '../../styles/startup-intro.css'

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const REVEAL_MS = 760
const SKIP_REVEAL_MS = 450

export function StartupIntro({ cinematic, ready, onComplete }: {
  cinematic: boolean
  ready: boolean
  onComplete(): void
}) {
  const [reduced, setReduced] = useState(() => window.matchMedia(MOTION_QUERY).matches)
  const [settled, setSettled] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [interrupted, setInterrupted] = useState(() => document.hidden)
  const scene = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const fullMotion = cinematic && !reduced && !interrupted
  const leaving = fullMotion && ready && (settled || skipped)
  const revealMs = skipped ? SKIP_REVEAL_MS : REVEAL_MS

  useEffect(() => {
    const motion = window.matchMedia(MOTION_QUERY)
    const updateMotion = () => {
      setReduced(motion.matches)
      if (motion.matches) setInterrupted(true)
    }
    const onVisibility = () => { if (document.hidden) setInterrupted(true) }
    motion.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      motion.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useLayoutEffect(() => {
    if (!fullMotion || settled || leaving || !canvas.current || !scene.current) return
    const draw = createIntroScene(canvas.current, scene.current)
    if (!draw) {
      setInterrupted(true)
      return
    }
    let start: number | undefined
    let frame = 0
    const render = (now: number) => {
      start ??= now
      const elapsed = Math.min(INTRO_PLAY_MS, now - start)
      draw(elapsed / 1000)
      if (elapsed < INTRO_PLAY_MS) frame = requestAnimationFrame(render)
      else setSettled(true)
    }
    draw(0)
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [fullMotion, leaving, settled])

  useLayoutEffect(() => {
    if (ready && !fullMotion) onComplete()
  }, [fullMotion, onComplete, ready])

  useEffect(() => {
    if (!leaving) return
    const fallback = window.setTimeout(onComplete, revealMs + 80)
    return () => window.clearTimeout(fallback)
  }, [leaving, onComplete, revealMs])

  useEffect(() => {
    if (!ready || !fullMotion || leaving) return
    const skipWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      setSkipped(true)
    }
    window.addEventListener('keydown', skipWithEscape)
    return () => window.removeEventListener('keydown', skipWithEscape)
  }, [fullMotion, leaving, ready])

  return <section
    className="startup-intro"
    aria-label="Abertura do Auri"
    data-phase={leaving ? 'reveal' : fullMotion && !settled ? 'film' : 'hold'}
    data-motion={fullMotion ? 'cinematic' : 'quick'}
    data-skipped={skipped || undefined}
    onAnimationEnd={(event) => {
      if (leaving && event.target === event.currentTarget && event.animationName === 'auri-library-reveal') onComplete()
    }}
  >
    <div className="startup-intro__scene" ref={scene}>
      <div className="startup-intro__light" aria-hidden="true" />
      {fullMotion && <canvas className="startup-intro__canvas" ref={canvas} aria-hidden="true" />}
      <div className="startup-intro__seal" aria-hidden="true">
        <div className="startup-intro__rim"><img src={APP_BRAND.iconPath} alt="" draggable={false} /></div>
      </div>
      <div className="startup-intro__title">
        <h1>{APP_BRAND.name}</h1>
        {fullMotion && <p>Histórias ganham vida</p>}
      </div>
    </div>
    {!ready && <p className={fullMotion && !settled ? 'sr-only' : 'startup-intro__status'} role="status">Preparando sua biblioteca…</p>}
    {ready && fullMotion && <button className="startup-intro__skip" type="button" onClick={() => setSkipped(true)} disabled={leaving} aria-keyshortcuts="Escape">
      Pular introdução <kbd aria-hidden="true">Esc</kbd>
    </button>}
  </section>
}
