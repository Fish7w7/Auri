import { useRef, type ReactNode } from 'react'

export function KeyboardMenu({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] > button:not(:disabled)') ?? [])
  return <details ref={ref} className={className} data-keyboard-menu onToggle={() => buttons().forEach((button) => button.setAttribute('role', 'menuitem'))} onKeyDown={(event) => {
    if (!ref.current?.open) return
    const items = buttons()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); ref.current.open = false; ref.current.querySelector<HTMLElement>('summary')?.focus(); return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }}>
    <summary aria-label={label} aria-haspopup="menu">•••</summary>
    <div role="menu" onClick={() => { if (ref.current) ref.current.open = false }}>{children}</div>
  </details>
}
