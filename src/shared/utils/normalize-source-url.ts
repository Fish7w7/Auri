export function normalizeSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    url.hostname = url.hostname.toLocaleLowerCase('en-US')
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    url.searchParams.sort()
    return url.toString()
  } catch {
    return null
  }
}
