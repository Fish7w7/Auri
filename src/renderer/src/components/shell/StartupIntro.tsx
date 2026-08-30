import { useEffect, useState } from 'react'
import { APP_BRAND } from '@shared/constants/app-branding'
import '../../styles/startup-intro.css'

const INTRO_FALLBACK_MS = 1_800

export function StartupIntro() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const fallback = window.setTimeout(() => setVisible(false), INTRO_FALLBACK_MS)
    return () => window.clearTimeout(fallback)
  }, [])

  if (!visible) return null

  return <div
    className="startup-intro"
    aria-hidden="true"
    onAnimationEnd={(event) => {
      if (event.currentTarget === event.target && event.animationName === 'auri-intro-overlay') {
        setVisible(false)
      }
    }}
  >
    <div className="startup-intro__identity">
      <span className="startup-intro__halo" />
      <img className="startup-intro__mark" src={APP_BRAND.iconPath} alt="" draggable={false} />
      <strong className="startup-intro__name">{APP_BRAND.name}</strong>
    </div>
  </div>
}
