import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export function Dialog({ open, title, description, children, onClose, footer }: { open: boolean; title: string; description?: string; children?: ReactNode; onClose(): void; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      window.requestAnimationFrame(() => {
        const initial = dialog.querySelector<HTMLElement>('[autofocus], [data-dialog-initial-focus], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])')
        initial?.focus()
      })
    }
    if (!open && dialog.open) dialog.close()
  }, [open])
  const restoreFocus = () => {
    const target = opener.current
    opener.current = null
    if (target?.isConnected) window.requestAnimationFrame(() => target.focus())
  }
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={() => { restoreFocus(); if (open) onClose() }}>
      <div className="dialog__body">
        <h2 id={titleId}>{title}</h2>
        {description && <p className="dialog__description">{description}</p>}
        {children}
      </div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, description, confirmLabel, danger = false, busy = false, onConfirm, onClose }: { open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm(): void | Promise<void>; onClose(): void }) {
  return <Dialog open={open} title={title} description={description} onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={() => void onConfirm()}>{busy ? 'Aguarde…' : confirmLabel}</Button></>} />
}
