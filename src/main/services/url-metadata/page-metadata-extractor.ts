import type { UrlPageMetadata } from '@shared/contracts'
import { isBlockedDestination, parseAllowedHttpUrl } from './url-safety'

type JsonObject = Record<string, unknown>

const RELEVANT_JSON_LD_TYPES = new Set([
  'article', 'book', 'comicstory', 'creativework', 'manga', 'novel', 'webpage', 'webcomic'
])

export function extractPageMetadata(html: string, requestedUrl: string, finalUrl: string): UrlPageMetadata {
  const meta = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1])
    const key = (attributes.property ?? attributes.name ?? '').toLocaleLowerCase('en-US')
    const value = cleanText(attributes.content, 4_000)
    if (key && value && !meta.has(key)) meta.set(key, value)
  }

  let canonical: string | null = null
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1])
    const rel = attributes.rel?.toLocaleLowerCase('en-US').split(/\s+/) ?? []
    if (rel.includes('canonical')) {
      canonical = resolvePublicResourceUrl(attributes.href, finalUrl)
      if (canonical) break
    }
  }

  const jsonLd = extractJsonLd(html, finalUrl)
  const htmlTitle = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], 300, true)
  const title = firstText(meta.get('og:title'), jsonLd.title, htmlTitle)
  const siteName = firstText(meta.get('og:site_name'), jsonLd.siteName, meta.get('application-name'))
  const description = firstText(meta.get('og:description'), jsonLd.description, meta.get('description'))
  const coverUrl = firstUrl(resolvePublicResourceUrl(meta.get('og:image'), finalUrl), jsonLd.coverUrl)
  const canonicalUrl = firstUrl(canonical, resolvePublicResourceUrl(meta.get('og:url'), finalUrl))
  const parsedFinal = parseAllowedHttpUrl(finalUrl)

  return {
    requestedUrl,
    finalUrl: parsedFinal.toString(),
    domain: parsedFinal.hostname.toLocaleLowerCase('en-US'),
    canonicalUrl,
    title,
    siteName,
    description,
    coverUrl
  }
}

function extractJsonLd(html: string, baseUrl: string): { title: string | null; siteName: string | null; description: string | null; coverUrl: string | null } {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = parseAttributes(match[1])
    if (attributes.type?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') !== 'application/ld+json') continue
    try {
      const raw = match[2].trim().replace(/^<!--|-->$/g, '').trim()
      const parsed = JSON.parse(raw) as unknown
      for (const candidate of flattenJsonLd(parsed)) {
        if (!isRelevantJsonLd(candidate)) continue
        const title = firstText(asText(candidate.name), asText(candidate.headline))
        const description = cleanText(asText(candidate.description), 4_000)
        const coverUrl = resolvePublicResourceUrl(readImage(candidate.image), baseUrl)
        const siteName = cleanText(readPublisher(candidate.publisher), 160)
        if (title || description || coverUrl || siteName) return { title, description, coverUrl, siteName }
      }
    } catch {
      // JSON-LD inválido não invalida os outros fallbacks da página.
    }
  }
  return { title: null, siteName: null, description: null, coverUrl: null }
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!isObject(value)) return []
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : []
  return [value, ...graph]
}

function isRelevantJsonLd(value: JsonObject): boolean {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.some((type) => typeof type === 'string' && RELEVANT_JSON_LD_TYPES.has(type.toLocaleLowerCase('en-US')))
}

function readImage(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(readImage).find(Boolean) ?? null
  if (!isObject(value)) return null
  return firstText(asText(value.url), asText(value.contentUrl))
}

function readPublisher(value: unknown): string | null {
  if (typeof value === 'string') return value
  return isObject(value) ? asText(value.name) : null
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLocaleLowerCase('en-US')
    if (!(name in attributes)) attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function cleanText(value: string | null | undefined, maxLength: number, stripMarkup = false): string | null {
  if (!value) return null
  const decoded = decodeEntities(stripMarkup ? value.replace(/<[^>]+>/g, ' ') : value)
  const cleaned = decoded.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] === '#') {
      const hex = token[1]?.toLocaleLowerCase('en-US') === 'x'
      const point = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
    }
    return named[token.toLocaleLowerCase('en-US')] ?? entity
  })
}

function resolvePublicResourceUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null
  try {
    const url = new URL(value, baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isBlockedDestination(url.hostname)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanText(value, 4_000)
    if (cleaned) return cleaned
  }
  return null
}

function firstUrl(...values: Array<string | null | undefined>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null
}

function asText(value: unknown): string | null { return typeof value === 'string' ? value : null }
function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) }
