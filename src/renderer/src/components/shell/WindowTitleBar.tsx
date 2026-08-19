import { useEffect, useState } from 'react'

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
    <div><img src="./lumi-icon.png" alt="" draggable={false} /><strong>Lumi</strong></div>
  </header>
}
