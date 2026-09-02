export type LazyBulkResourceStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LazyBulkResourceSnapshot<T> {
  status: LazyBulkResourceStatus
  value: T
  error?: string
}

export interface LazyBulkResourceLoader<T> {
  getSnapshot(): LazyBulkResourceSnapshot<T>
  load(): Promise<T | undefined>
}

export function createLazyBulkResourceLoader<T>(
  initialValue: T,
  request: () => Promise<T>,
  onChange: (snapshot: LazyBulkResourceSnapshot<T>) => void,
  errorMessage: string
): LazyBulkResourceLoader<T> {
  let snapshot: LazyBulkResourceSnapshot<T> = { status: 'idle', value: initialValue }
  let pending: Promise<T | undefined> | null = null

  const publish = (next: LazyBulkResourceSnapshot<T>) => {
    snapshot = next
    onChange(next)
  }

  return {
    getSnapshot: () => snapshot,
    load: () => {
      if (snapshot.status === 'ready') return Promise.resolve(snapshot.value)
      if (pending) return pending

      publish({ status: 'loading', value: snapshot.value })
      pending = request()
        .then((value) => {
          publish({ status: 'ready', value })
          return value
        })
        .catch(() => {
          publish({ status: 'error', value: snapshot.value, error: errorMessage })
          return undefined
        })
        .finally(() => { pending = null })
      return pending
    }
  }
}
