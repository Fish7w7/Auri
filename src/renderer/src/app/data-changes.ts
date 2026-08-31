import type { DesktopWorkChange } from '@shared/contracts'

export const DATA_CHANGED_EVENT = 'auri:data-changed'

export function dispatchDataChanged(change?: DesktopWorkChange, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent<DesktopWorkChange | undefined>(DATA_CHANGED_EVENT, { detail: change }))
}

export function subscribeToDataChanges(
  listener: () => void,
  workId?: string,
  target: EventTarget = window
): () => void {
  const handler: EventListener = (event) => {
    const change = (event as CustomEvent<DesktopWorkChange | undefined>).detail
    if (workId && change?.workId && change.workId !== workId) return
    listener()
  }
  target.addEventListener(DATA_CHANGED_EVENT, handler)
  return () => target.removeEventListener(DATA_CHANGED_EVENT, handler)
}
