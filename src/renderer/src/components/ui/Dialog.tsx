import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from './Button'

const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

export function getDialogFocusableElements(dialog: Pick<HTMLElement, 'querySelectorAll'>): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => element.getAttribute('aria-hidden') !== 'true')
}

export async function runDialogAction(action: () => void | Promise<void>, onError: (message: string) => void): Promise<boolean> {
  try {
    await action()
    return true
  } catch (cause) {
    onError(cause instanceof Error ? cause.message : 'Não foi possível concluir esta ação.')
    return false
  }
}

type DialogSize = 'small' | 'medium' | 'large'

export function Dialog({ open, title, description, children, onClose, footer, busy = false, error, size = 'medium' }: { open: boolean; title: string; description?: ReactNode; children?: ReactNode; onClose(): void; footer?: ReactNode; busy?: boolean; error?: string | null; size?: DialogSize }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      window.requestAnimationFrame(() => {
        const initial = dialog.querySelector<HTMLElement>('[autofocus], [data-dialog-initial-focus]') ?? getDialogFocusableElements(dialog)[0]
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

  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return
    const dialog = ref.current
    if (!dialog) return
    const focusable = getDialogFocusableElements(dialog)
    if (!focusable.length) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${size}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy || undefined}
      tabIndex={-1}
      onKeyDown={trapFocus}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClose={() => {
        restoreFocus()
        if (open && !busy) onClose()
      }}
    >
      <div className="dialog__body">
        <h2 id={titleId}>{title}</h2>
        {description && <div id={descriptionId} className="dialog__description">{description}</div>}
        {error && <p className="dialog__error" role="alert">{error}</p>}
        {children}
      </div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, description, context, warning, confirmLabel, cancelLabel = 'Cancelar', danger = false, busy = false, onConfirm, onClose }: { open: boolean; title: string; description: ReactNode; context?: ReactNode; warning?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm(): void | Promise<void>; onClose(): void }) {
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const loading = busy || pending

  useEffect(() => {
    if (!open) {
      pendingRef.current = false
      setPending(false)
      setError(null)
    }
  }, [open])

  const confirm = async () => {
    if (loading || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      await runDialogAction(onConfirm, setError)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const copy = <div className="confirm-dialog__copy">{context && <div className="confirm-dialog__context">{context}</div>}<p>{description}</p>{warning && <strong className="confirm-dialog__warning">{warning}</strong>}</div>
  return <Dialog open={open} title={title} description={copy} size="small" busy={loading} error={error} onClose={onClose} footer={<><Button data-dialog-initial-focus disabled={loading} onClick={onClose}>{cancelLabel}</Button><Button variant={danger ? 'danger' : 'primary'} disabled={loading} onClick={() => void confirm()}>{loading ? 'Aguarde…' : confirmLabel}</Button></>} />
}
