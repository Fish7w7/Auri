import { useEffect, useState } from 'react'
import { APP_BRAND } from '@shared/constants/app-branding'

export function WindowTitleBar() {
  const [active, setActive] = useState(document.hasFocus())

  useEffect(() => {
    const activate = () => setActive(true)
    const deactivate = () => setActive(false)
    window.addEventListener('focus', activate)
    window.addEventListener('blur', deactivate)
    return () => {
      window.removeEventListener('focus', activate)
      window.removeEventListener('blur', deactivate)
    }
  }, [])

  return <header className={`window-titlebar ${active ? 'is-active' : 'is-inactive'}`}>
    <div><strong>{APP_BRAND.name}</strong></div>
  </header>
}
