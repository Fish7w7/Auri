interface MutableBoolean {
  current: boolean
}

export type AddWorkPersistenceResult<T> =
  | { started: false }
  | { started: true; value: T }

export function blocksAddWorkNavigation(isPersisting: boolean): boolean {
  return isPersisting
}

export async function runExclusiveAddWorkPersistence<T>(
  lock: MutableBoolean,
  onPendingChange: (pending: boolean) => void,
  operation: () => Promise<T>
): Promise<AddWorkPersistenceResult<T>> {
  if (lock.current) return { started: false }
  lock.current = true
  onPendingChange(true)
  try {
    return { started: true, value: await operation() }
  } finally {
    lock.current = false
    onPendingChange(false)
  }
}
