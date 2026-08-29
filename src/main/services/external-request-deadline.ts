export async function withAbsoluteDeadline<T>(
  operation: Promise<T>,
  deadline: number,
  createTimeoutError: () => Error,
  onTimeout?: () => void
): Promise<T> {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) {
    onTimeout?.()
    throw createTimeoutError()
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(createTimeoutError())
    }, remainingMs)
  })
  try { return await Promise.race([operation, timeout]) }
  finally { if (timer) clearTimeout(timer) }
}
