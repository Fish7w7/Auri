import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export function Dialog({ open, title, description, children, onClose, footer }: { open: boolean; title: string; description?: string; children?: ReactNode; onClose(): void; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" onCancel={(event) => { event.preventDefault(); onClose() }} onClose={onClose}>
      <div className="dialog__body">
        <h2>{title}</h2>
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

