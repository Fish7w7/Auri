import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error'
interface ToastInput { kind?: ToastKind; message: string; action?: { label: string; onClick: () => void | Promise<void> } }
interface ToastItem extends ToastInput { id: number }

const ToastContext = createContext<{ showToast(input: ToastInput): void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const showToast = useCallback((input: ToastInput) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { ...input, id }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5200)
  }, [])
  const value = useMemo(() => ({ showToast }), [showToast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-label="Notificações">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.kind ?? 'info'}`} key={toast.id}>
            <p>{toast.message}</p>
            {toast.action && <button onClick={() => { void toast.action!.onClick(); setToasts((current) => current.filter((item) => item.id !== toast.id)) }}>{toast.action.label}</button>}
            <button className="toast__close" aria-label="Fechar notificação" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de ToastProvider.')
  return context
}

