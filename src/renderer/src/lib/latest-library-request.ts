export type LibraryRequestPhase = 'initial' | 'refresh'

interface MutableValue<T> {
  current: T
}

interface LatestLibraryRequestOptions<T> {
  generation: MutableValue<number>
  hasAcceptedResult: MutableValue<boolean>
  request(): Promise<T>
  onStart(phase: LibraryRequestPhase): void
  onSuccess(result: T): void
  onError(error: unknown, phase: LibraryRequestPhase): void
  onSettled(): void
}

export async function runLatestLibraryRequest<T>({
  generation,
  hasAcceptedResult,
  request,
  onStart,
  onSuccess,
  onError,
  onSettled
}: LatestLibraryRequestOptions<T>): Promise<boolean> {
  const requestGeneration = ++generation.current
  const phase: LibraryRequestPhase = hasAcceptedResult.current ? 'refresh' : 'initial'
  onStart(phase)

  try {
    const result = await request()
    if (requestGeneration !== generation.current) return false
    hasAcceptedResult.current = true
    onSuccess(result)
    return true
  } catch (error) {
    if (requestGeneration !== generation.current) return false
    onError(error, phase)
    return true
  } finally {
    if (requestGeneration === generation.current) onSettled()
  }
}
