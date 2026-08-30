import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type MenuPlacement = 'top' | 'bottom'

interface ActiveMenu {
  id: string
  close(): void
}

interface MenuPosition {
  strategy: 'fixed' | 'absolute'
  top: number
  left: number
  placement: MenuPlacement
}

export class KeyboardMenuCoordinator {
  private active: ActiveMenu | null = null

  open(id: string, close: () => void): void {
    const previous = this.active
    this.active = { id, close }
    if (previous && previous.id !== id) previous.close()
  }

  close(id: string): void {
    if (this.active?.id === id) this.active = null
  }
}

export function chooseMenuPlacement(anchorTop: number, anchorBottom: number, menuHeight: number, viewportHeight: number): MenuPlacement {
  const spaceAbove = anchorTop - 8
  const spaceBelow = viewportHeight - anchorBottom - 8
  return spaceBelow < menuHeight + 6 && spaceAbove > spaceBelow ? 'top' : 'bottom'
}

const menuCoordinator = new KeyboardMenuCoordinator()

export function KeyboardMenu({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const triggerId = `${reactId}-trigger`
  const menuId = `${reactId}-menu`
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false)
    setPosition(null)
    menuCoordinator.close(menuId)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [menuId])

  const openMenu = () => {
    setPosition(null)
    menuCoordinator.open(menuId, () => {
      setOpen(false)
      setPosition(null)
    })
    setOpen(true)
  }

  const buttons = useCallback(() => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? []), [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    const items = buttons()
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return
    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }

  const portalTarget = open && typeof document !== 'undefined'
    ? rootRef.current?.closest('dialog') ?? document.body
    : null

  useLayoutEffect(() => {
    if (!open || !portalTarget) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    for (const button of buttons()) button.setAttribute('role', 'menuitem')
    const anchor = trigger.getBoundingClientRect()
    const menuBounds = menu.getBoundingClientRect()
    const placement = chooseMenuPlacement(anchor.top, anchor.bottom, menuBounds.height, window.innerHeight)
    const viewportTop = placement === 'top' ? anchor.top - menuBounds.height - 6 : anchor.bottom + 6
    const viewportLeft = Math.min(Math.max(anchor.right - menuBounds.width, 8), window.innerWidth - menuBounds.width - 8)
    const origin = portalTarget === document.body ? { top: 0, left: 0 } : portalTarget.getBoundingClientRect()
    setPosition({
      strategy: portalTarget === document.body ? 'fixed' : 'absolute',
      top: Math.min(Math.max(viewportTop, 8), window.innerHeight - menuBounds.height - 8) - origin.top + portalTarget.scrollTop,
      left: viewportLeft - origin.left + portalTarget.scrollLeft,
      placement
    })
  }, [buttons, open, portalTarget])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) closeMenu()
    }
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      closeMenu(true)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
    }
    const closeOnResize = () => closeMenu()
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('scroll', closeOnScroll, true)
    document.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('resize', closeOnResize)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('scroll', closeOnScroll, true)
      document.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('resize', closeOnResize)
    }
  }, [closeMenu, open])

  useEffect(() => () => menuCoordinator.close(menuId), [menuId])

  const popoverClassName = className.split(/\s+/).filter(Boolean).map((name) => `${name}__popover`).join(' ')
  const popoverStyle: CSSProperties = {
    position: position?.strategy ?? 'fixed',
    top: position?.top ?? 0,
    left: position?.left ?? 0,
    visibility: position ? 'visible' : 'hidden'
  }

  return <>
    <div ref={rootRef} className={className} data-keyboard-menu data-open={open || undefined} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
      <button ref={triggerRef} id={triggerId} className="keyboard-menu__trigger" type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => open ? closeMenu() : openMenu()}>•••</button>
    </div>
    {open && portalTarget && createPortal(
      <div
        ref={menuRef}
        id={menuId}
        className={`keyboard-menu__popover ${popoverClassName}`}
        role="menu"
        aria-labelledby={triggerId}
        data-placement={position?.placement}
        style={popoverStyle}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
            closeMenu()
            triggerRef.current?.focus()
          }
        }}
        onKeyDown={handleKeyDown}
      >{children}</div>,
      portalTarget
    )}
  </>
}
