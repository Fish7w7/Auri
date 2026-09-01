import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'info' | 'warning' | 'error' | 'progress'
export type ToastId = string

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}

export interface ToastInput {
  kind?: ToastKind
  message: string
  action?: ToastAction
  dedupeKey?: string
  durationMs?: number | null
}

export type ToastUpdate = Partial<Omit<ToastInput, 'dedupeKey'>>

export interface ToastItem extends Omit<ToastInput, 'kind' | 'durationMs'> {
  id: ToastId
  kind: ToastKind
  durationMs: number | null
  revision: number
  overflowCount?: number
  exiting?: boolean
}

export interface ToastState {
  visible: ToastItem[]
  queue: ToastItem[]
}

export const TOAST_DURATIONS = {
  success: 5_000,
  info: 5_000,
  warning: 7_000,
  error: 8_000,
  action: 9_000
} as const
export const MAX_VISIBLE_TOASTS = 2
export const MAX_TOAST_QUEUE = 6
export const TOAST_EXIT_DURATION_MS = 140

const OVERFLOW_KEY = '__auri_toast_overflow__'
const INITIAL_STATE: ToastState = { visible: [], queue: [] }

export type ToastEvent =
  | { type: 'enqueue'; item: ToastItem }
  | { type: 'update'; id: ToastId; patch: ToastUpdate }
  | { type: 'start-dismiss'; id: ToastId }
  | { type: 'cancel-dismiss'; id: ToastId }
  | { type: 'dismiss'; id: ToastId }

export function pauseToastDuration(remainingMs: number, startedAt: number, now: number): number {
  return Math.max(0, remainingMs - (now - startedAt))
}

export function shouldResumeToastTimer(containsTarget: (target: EventTarget) => boolean, relatedTarget: EventTarget | null): boolean {
  return relatedTarget === null || !containsTarget(relatedTarget)
}

export async function runToastActionOnce(id: ToastId, locks: Set<ToastId>, action: () => void | Promise<void>): Promise<boolean> {
  if (locks.has(id)) return false
  locks.add(id)
  try { await action(); return true }
  catch (error) { locks.delete(id); throw error }
}

function durationFor(kind: ToastKind, action?: ToastAction): number | null {
  if (kind === 'progress') return null
  if (action) return TOAST_DURATIONS.action
  return TOAST_DURATIONS[kind]
}

export function createToastItem(input: ToastInput, id: ToastId): ToastItem {
  const kind = input.kind ?? 'info'
  return {
    ...input,
    id,
    kind,
    durationMs: input.durationMs === undefined ? durationFor(kind, input.action) : input.durationMs,
    revision: 0
  }
}

function fingerprint(item: Pick<ToastItem, 'kind' | 'message' | 'action'>): string {
  return `${item.kind}|${item.message}|${item.action?.label ?? ''}`
}

function mergeDuplicate(current: ToastItem, incoming: ToastItem): ToastItem {
  return { ...current, ...incoming, id: current.id, revision: current.revision + 1 }
}

function updateItem(item: ToastItem, patch: ToastUpdate): ToastItem {
  const kind = patch.kind ?? item.kind
  const action = patch.action === undefined ? item.action : patch.action
  const durationMs = patch.durationMs === undefined
    ? patch.kind === undefined && patch.action === undefined ? item.durationMs : durationFor(kind, action)
    : patch.durationMs
  return { ...item, ...patch, kind, action, durationMs, revision: item.revision + 1 }
}

function isProtected(item: ToastItem): boolean {
  return item.kind === 'error' || item.kind === 'progress' || item.action !== undefined
}

function fillVisible(visible: ToastItem[], queue: ToastItem[]): ToastState {
  const nextVisible = [...visible]
  const nextQueue = [...queue]
  while (nextVisible.length < MAX_VISIBLE_TOASTS && nextQueue.length) nextVisible.push(nextQueue.shift()!)
  return { visible: nextVisible, queue: nextQueue }
}

function recordOverflow(queue: ToastItem[], incomingId: ToastId): ToastItem[] {
  const index = queue.findIndex((item) => item.dedupeKey === OVERFLOW_KEY)
  if (index >= 0) {
    const current = queue[index]
    const count = (current.overflowCount ?? 1) + 1
    return queue.map((item, itemIndex) => itemIndex === index ? {
      ...current,
      message: `${count} notificações foram agrupadas para evitar excesso.`,
      overflowCount: count,
      revision: current.revision + 1
    } : item)
  }
  return [...queue, createToastItem({ kind: 'warning', message: 'Algumas notificações foram agrupadas para evitar excesso.', dedupeKey: OVERFLOW_KEY }, `${incomingId}-overflow`)]
}

function mergeSemanticDuplicate(items: ToastItem[], incoming: ToastItem): ToastItem[] | null {
  if (!incoming.dedupeKey) return null
  const index = items.findIndex((item) => item.dedupeKey === incoming.dedupeKey)
  if (index < 0) return null
  return items.map((item, itemIndex) => itemIndex === index ? mergeDuplicate(item, incoming) : item)
}

export function toastReducer(state: ToastState, event: ToastEvent): ToastState {
  if (event.type === 'start-dismiss' || event.type === 'cancel-dismiss') {
    const exiting = event.type === 'start-dismiss'
    return {
      visible: state.visible.map((item) => item.id === event.id ? { ...item, exiting } : item),
      queue: state.queue.map((item) => item.id === event.id ? { ...item, exiting } : item)
    }
  }

  if (event.type === 'dismiss') {
    const visible = state.visible.filter((item) => item.id !== event.id)
    if (visible.length !== state.visible.length) return fillVisible(visible, state.queue)
    return { ...state, queue: state.queue.filter((item) => item.id !== event.id) }
  }

  if (event.type === 'update') {
    return {
      visible: state.visible.map((item) => item.id === event.id ? updateItem(item, event.patch) : item),
      queue: state.queue.map((item) => item.id === event.id ? updateItem(item, event.patch) : item)
    }
  }

  const visibleDuplicate = mergeSemanticDuplicate(state.visible, event.item)
  if (visibleDuplicate) return { ...state, visible: visibleDuplicate }
  const queuedDuplicate = mergeSemanticDuplicate(state.queue, event.item)
  if (queuedDuplicate) return { ...state, queue: queuedDuplicate }

  if (!event.item.dedupeKey) {
    const newest = state.queue.at(-1) ?? state.visible.at(-1)
    if (newest && fingerprint(newest) === fingerprint(event.item)) {
      if (state.queue.length) {
        return { ...state, queue: state.queue.map((item, index) => index === state.queue.length - 1 ? mergeDuplicate(item, event.item) : item) }
      }
      return { ...state, visible: state.visible.map((item, index) => index === state.visible.length - 1 ? mergeDuplicate(item, event.item) : item) }
    }
  }

  if (state.visible.length < MAX_VISIBLE_TOASTS) return { ...state, visible: [...state.visible, event.item] }
  if (state.queue.length < MAX_TOAST_QUEUE) return { ...state, queue: [...state.queue, event.item] }

  const discardableIndex = state.queue.findIndex((item) => !isProtected(item) && item.dedupeKey !== OVERFLOW_KEY)
  if (discardableIndex >= 0 && isProtected(event.item)) {
    const queue = state.queue.filter((_, index) => index !== discardableIndex)
    return { ...state, queue: recordOverflow([...queue, event.item], event.item.id) }
  }
  return { ...state, queue: recordOverflow(state.queue, event.item.id) }
}

interface ToastContextValue {
  showToast(input: ToastInput): ToastId
  updateToast(id: ToastId, patch: ToastUpdate): void
  dismissToast(id: ToastId): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function ToastCard({ toast, busy, onDismiss, onAction }: {
  toast: ToastItem
  busy: boolean
  onDismiss(id: ToastId): void
  onAction(toast: ToastItem): Promise<void>
}) {
  const timer = useRef<number | null>(null)
  const remaining = useRef<number | null>(null)
  const startedAt = useRef(0)
  const pauseReasons = useRef(new Set<'hover' | 'focus'>())

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const startTimer = (duration: number) => {
    clearTimer()
    remaining.current = duration
    startedAt.current = performance.now()
    timer.current = window.setTimeout(() => onDismiss(toast.id), duration)
  }

  useEffect(() => {
    clearTimer()
    remaining.current = toast.durationMs
    if (toast.durationMs !== null && !toast.exiting && pauseReasons.current.size === 0) startTimer(toast.durationMs)
    return clearTimer
  }, [toast.id, toast.revision, toast.durationMs, toast.exiting, onDismiss])

  const pauseTimer = (reason: 'hover' | 'focus') => {
    const alreadyPaused = pauseReasons.current.size > 0
    pauseReasons.current.add(reason)
    if (alreadyPaused) return
    if (timer.current === null || remaining.current === null) return
    remaining.current = pauseToastDuration(remaining.current, startedAt.current, performance.now())
    clearTimer()
  }
  const resumeTimer = (reason: 'hover' | 'focus') => {
    pauseReasons.current.delete(reason)
    if (pauseReasons.current.size > 0 || toast.exiting) return
    if (remaining.current === null || timer.current !== null) return
    if (remaining.current <= 0) onDismiss(toast.id)
    else startTimer(remaining.current)
  }

  return <div
    className={`toast toast--${toast.kind}${toast.exiting ? ' is-exiting' : ''}`}
    role={toast.kind === 'error' ? 'alert' : 'status'}
    aria-atomic="true"
    aria-busy={toast.kind === 'progress' || undefined}
    onMouseEnter={() => pauseTimer('hover')}
    onMouseLeave={() => resumeTimer('hover')}
    onFocusCapture={() => pauseTimer('focus')}
    onBlurCapture={(event) => {
      if (shouldResumeToastTimer((target) => event.currentTarget.contains(target as Node), event.relatedTarget)) resumeTimer('focus')
    }}
  >
    <span className="toast__indicator" aria-hidden="true" />
    <p>{toast.message}</p>
    {toast.action && <button className="toast__action" disabled={busy} onClick={() => void onAction(toast)}>{busy ? 'Aguarde…' : toast.action.label}</button>}
    {toast.kind !== 'progress' && <button className="toast__close" aria-label="Fechar notificação" onClick={() => onDismiss(toast.id)}>×</button>}
  </div>
}

function ToastRegion({ toasts, actionBusy, onDismiss, onAction }: {
  toasts: ToastItem[]
  actionBusy: Set<ToastId>
  onDismiss(id: ToastId): void
  onAction(toast: ToastItem): Promise<void>
}) {
  const region = useRef<HTMLDivElement>(null)
  const previousPositions = useRef(new Map<ToastId, number>())

  useLayoutEffect(() => {
    const nextPositions = new Map<ToastId, number>()
    const slots = region.current?.querySelectorAll<HTMLElement>('[data-toast-id]') ?? []
    for (const slot of slots) {
      const id = slot.dataset.toastId
      if (!id) continue
      const top = slot.getBoundingClientRect().top
      const previousTop = previousPositions.current.get(id)
      nextPositions.set(id, top)
      if (previousTop === undefined || previousTop === top) continue
      slot.classList.remove('is-repositioning')
      slot.style.setProperty('--toast-shift-y', `${previousTop - top}px`)
      void slot.offsetWidth
      slot.classList.add('is-repositioning')
    }
    previousPositions.current = nextPositions
  }, [toasts])

  return <div ref={region} className="toast-region" aria-live="polite" aria-relevant="additions text" aria-label="Notificações">
    {toasts.map((toast) => <div
      className="toast-slot"
      data-toast-id={toast.id}
      key={toast.id}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.classList.remove('is-repositioning')
      }}
    >
      <ToastCard toast={toast} busy={actionBusy.has(toast.id)} onDismiss={onDismiss} onAction={onAction} />
    </div>)}
  </div>
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(INITIAL_STATE)
  const [actionBusy, setActionBusy] = useState<Set<ToastId>>(() => new Set())
  const sequence = useRef(0)
  const actionLocks = useRef(new Set<ToastId>())
  const exitTimers = useRef(new Map<ToastId, number>())

  useEffect(() => () => {
    for (const timer of exitTimers.current.values()) window.clearTimeout(timer)
    exitTimers.current.clear()
  }, [])

  useEffect(() => {
    const liveIds = new Set([...state.visible, ...state.queue].map((item) => item.id))
    for (const id of actionLocks.current) if (!liveIds.has(id)) actionLocks.current.delete(id)
    setActionBusy((current) => {
      const next = new Set([...current].filter((id) => liveIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [state.visible, state.queue])

  const dispatch = useCallback((event: ToastEvent) => setState((current) => toastReducer(current, event)), [])
  const cancelDismiss = useCallback((id: ToastId) => {
    const timer = exitTimers.current.get(id)
    if (timer === undefined) return
    window.clearTimeout(timer)
    exitTimers.current.delete(id)
    dispatch({ type: 'cancel-dismiss', id })
  }, [dispatch])
  const dismissToast = useCallback((id: ToastId) => {
    if (exitTimers.current.has(id)) return
    dispatch({ type: 'start-dismiss', id })
    const timer = window.setTimeout(() => {
      exitTimers.current.delete(id)
      dispatch({ type: 'dismiss', id })
    }, TOAST_EXIT_DURATION_MS)
    exitTimers.current.set(id, timer)
  }, [dispatch])
  const updateToast = useCallback((id: ToastId, patch: ToastUpdate) => {
    cancelDismiss(id)
    dispatch({ type: 'update', id, patch })
  }, [cancelDismiss, dispatch])
  const showToast = useCallback((input: ToastInput) => {
    const id = input.dedupeKey ? `toast-key-${input.dedupeKey}` : `toast-${Date.now()}-${++sequence.current}`
    cancelDismiss(id)
    dispatch({ type: 'enqueue', item: createToastItem(input, id) })
    return id
  }, [cancelDismiss, dispatch])

  const runAction = async (toast: ToastItem) => {
    if (!toast.action || actionLocks.current.has(toast.id)) return
    setActionBusy((current) => new Set(current).add(toast.id))
    try {
      if (await runToastActionOnce(toast.id, actionLocks.current, toast.action.onClick)) dismissToast(toast.id)
    } catch (error) {
      updateToast(toast.id, { kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a ação.', action: undefined })
      actionLocks.current.delete(toast.id)
    } finally {
      setActionBusy((current) => {
        const next = new Set(current)
        next.delete(toast.id)
        return next
      })
    }
  }

  const value = useMemo(() => ({ showToast, updateToast, dismissToast }), [dismissToast, showToast, updateToast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={state.visible} actionBusy={actionBusy} onDismiss={dismissToast} onAction={runAction} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de ToastProvider.')
  return context
}
