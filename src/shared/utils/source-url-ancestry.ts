import { normalizeSourceUrl } from './normalize-source-url'

const GENERIC_SINGLE_SEGMENTS = new Set([
  'comic', 'comics', 'manga', 'mangas', 'obra', 'obras', 'read', 'reader',
  'serie', 'series', 'title', 'titles', 'webtoon', 'webtoons'
])
const MAX_ANCESTOR_CANDIDATES = 64

export function sourceUrlAncestorCandidates(pageUrl: string): string[] {
  const normalized = normalizeSourceUrl(pageUrl)
  if (!normalized) return []
  const page = new URL(normalized)
  const segments = pathSegments(page.pathname)
  const candidates = new Set<string>()

  const firstLength = Math.max(1, segments.length - MAX_ANCESTOR_CANDIDATES + 1)
  for (let length = firstLength; length <= segments.length; length += 1) {
    const pathname = `/${segments.slice(0, length).join('/')}`
    if (!isUsefulSourcePath(pathname)) continue
    const candidate = new URL(page.origin)
    candidate.pathname = pathname
    candidates.add(candidate.toString())
    if (page.search) {
      candidate.search = page.search
      candidates.add(candidate.toString())
    }
  }
  return [...candidates]
}

export function isSourceUrlAncestor(sourceUrl: string, pageUrl: string): boolean {
  const normalizedSource = normalizeSourceUrl(sourceUrl)
  const normalizedPage = normalizeSourceUrl(pageUrl)
  if (!normalizedSource || !normalizedPage) return false
  const source = new URL(normalizedSource)
  const page = new URL(normalizedPage)
  if (source.origin !== page.origin || !isUsefulSourcePath(source.pathname)) return false
  if (source.search && source.search !== page.search) return false
  return page.pathname === source.pathname || page.pathname.startsWith(`${source.pathname}/`)
}

export function sourceUrlSpecificity(sourceUrl: string): number {
  const normalized = normalizeSourceUrl(sourceUrl)
  if (!normalized) return 0
  const url = new URL(normalized)
  return pathSegments(url.pathname).length * 10_000 + url.pathname.length
}

function isUsefulSourcePath(pathname: string): boolean {
  const segments = pathSegments(pathname)
  if (segments.length === 0) return false
  return segments.length > 1 || !GENERIC_SINGLE_SEGMENTS.has(segments[0].toLocaleLowerCase('en-US'))
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}
