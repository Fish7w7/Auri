import type { UrlPageMetadata } from '@shared/contracts'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import { isBlockedDestination, parseAllowedHttpUrl } from './url-safety'

type JsonObject = Record<string, unknown>

const RELEVANT_JSON_LD_TYPES = new Set([
  'article', 'book', 'bookseries', 'comicseries', 'comicstory', 'creativework', 'creativeworkseries',
  'manga', 'novel', 'webpage', 'webcomic'
])
const WORK_JSON_LD_TYPES = new Set([
  'book', 'bookseries', 'comicseries', 'comicstory', 'creativework', 'creativeworkseries', 'manga', 'novel', 'webcomic'
])

interface JsonLdMetadata {
  title: string | null
  siteName: string | null
  websiteName: string | null
  description: string | null
  coverUrl: string | null
  workSpecific: boolean
  hasWebsite: boolean
}

export function extractPageMetadata(html: string, requestedUrl: string, finalUrl: string): UrlPageMetadata {
  const meta = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseAttributes(match[1])
    const key = (attributes.property ?? attributes.name ?? '').toLocaleLowerCase('en-US')
    const value = cleanText(attributes.content, 4_000)
    if (key && value && !meta.has(key)) meta.set(key, value)
  }

  const parsedFinal = parseAllowedHttpUrl(finalUrl)
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
  const ogTitle = cleanText(meta.get('og:title'), 300)
  const twitterTitle = cleanText(meta.get('twitter:title'), 300)
  const siteName = firstText(meta.get('og:site_name'), jsonLd.siteName, jsonLd.websiteName, meta.get('application-name'))
  const ogUrl = resolvePublicResourceUrl(meta.get('og:url'), finalUrl)
  const canonicalSuspicious = collapsesSpecificUrlToOriginRoot(parsedFinal, canonical)
  const ogUrlSuspicious = collapsesSpecificUrlToOriginRoot(parsedFinal, ogUrl)
  const socialIdentityLooksGlobal = equivalent(ogTitle, htmlTitle) || equivalent(ogTitle, siteName) ||
    equivalent(twitterTitle, ogTitle) || equivalent(twitterTitle, htmlTitle)
  const globalContext = isSpecificLocation(parsedFinal) && (
    canonicalSuspicious || ogUrlSuspicious ||
    ((meta.get('og:type')?.toLocaleLowerCase('en-US') === 'website' || jsonLd.hasWebsite) && socialIdentityLooksGlobal)
  )
  const h1Title = extractUniqueH1(html)

  let title: string | null
  let description: string | null
  let coverUrl: string | null
  if (globalContext) {
    const fingerprints = [htmlTitle, siteName, jsonLd.websiteName]
    const jsonLdSpecific = jsonLd.title && (jsonLd.workSpecific || isDistinct(jsonLd.title, fingerprints)) ? jsonLd.title : null
    const ogSpecific = isDistinct(ogTitle, fingerprints) ? ogTitle : null
    const twitterSpecific = isDistinct(twitterTitle, [...fingerprints, ogTitle]) ? twitterTitle : null
    const h1Specific = isDistinct(h1Title, [...fingerprints, ogTitle, twitterTitle]) ? h1Title : null
    title = firstText(jsonLdSpecific, ogSpecific, twitterSpecific, h1Specific)
    if (title && title === jsonLdSpecific) {
      description = jsonLd.description
      coverUrl = jsonLd.coverUrl
    } else if (title && title === ogSpecific) {
      description = cleanText(meta.get('og:description'), 4_000)
      coverUrl = resolvePublicResourceUrl(meta.get('og:image'), finalUrl)
    } else if (title && title === twitterSpecific) {
      description = cleanText(meta.get('twitter:description'), 4_000)
      coverUrl = resolvePublicResourceUrl(firstText(meta.get('twitter:image'), meta.get('twitter:image:src')), finalUrl)
    } else {
      description = null
      coverUrl = null
    }
  } else {
    title = firstText(ogTitle, jsonLd.title, twitterTitle, h1Title, htmlTitle)
    description = firstText(meta.get('og:description'), jsonLd.description, meta.get('twitter:description'), meta.get('description'))
    coverUrl = firstUrl(
      resolvePublicResourceUrl(meta.get('og:image'), finalUrl),
      jsonLd.coverUrl,
      resolvePublicResourceUrl(firstText(meta.get('twitter:image'), meta.get('twitter:image:src')), finalUrl)
    )
  }
  const canonicalUrl = firstUrl(canonicalSuspicious ? null : canonical, ogUrlSuspicious ? null : ogUrl)

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

function extractJsonLd(html: string, baseUrl: string): JsonLdMetadata {
  let websiteName: string | null = null
  let hasWebsite = false
  let selected: Omit<JsonLdMetadata, 'websiteName' | 'hasWebsite'> | null = null
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = parseAttributes(match[1])
    if (attributes.type?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') !== 'application/ld+json') continue
    try {
      const raw = match[2].trim().replace(/^<!--|-->$/g, '').trim()
      const parsed = JSON.parse(raw) as unknown
      for (const candidate of flattenJsonLd(parsed)) {
        const types = jsonLdTypes(candidate)
        if (types.includes('website')) {
          hasWebsite = true
          websiteName ??= cleanText(asText(candidate.name), 160)
        }
        if (!types.some((type) => RELEVANT_JSON_LD_TYPES.has(type))) continue
        const title = firstText(asText(candidate.name), asText(candidate.headline))
        const description = cleanText(asText(candidate.description), 4_000)
        const coverUrl = resolvePublicResourceUrl(readImage(candidate.image), baseUrl)
        const siteName = cleanText(readPublisher(candidate.publisher), 160)
        if (!selected && (title || description || coverUrl || siteName)) selected = {
          title, description, coverUrl, siteName,
          workSpecific: types.some((type) => WORK_JSON_LD_TYPES.has(type))
        }
      }
    } catch {
      // JSON-LD inválido não invalida os outros fallbacks da página.
    }
  }
  return selected
    ? { ...selected, websiteName, hasWebsite }
    : { title: null, siteName: null, websiteName, description: null, coverUrl: null, workSpecific: false, hasWebsite }
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!isObject(value)) return []
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(flattenJsonLd) : []
  return [value, ...graph]
}

function jsonLdTypes(value: JsonObject): string[] {
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  return types.filter((type): type is string => typeof type === 'string').map((type) => type.toLocaleLowerCase('en-US'))
}

function extractUniqueH1(html: string): string | null {
  const unique = new Map<string, string>()
  for (const match of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const value = cleanText(match[1], 300, true)
    if (value && value.length >= 3) unique.set(normalizeSearchText(value), value)
  }
  return unique.size === 1 ? [...unique.values()][0] : null
}

function isSpecificLocation(url: URL): boolean { return url.pathname !== '/' || Boolean(url.search) }

function collapsesSpecificUrlToOriginRoot(finalUrl: URL, candidate: string | null): boolean {
  if (!candidate || !isSpecificLocation(finalUrl)) return false
  try {
    const parsed = new URL(candidate)
    return parsed.host === finalUrl.host && parsed.pathname === '/' && !parsed.search
  } catch { return false }
}

function equivalent(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && normalizeSearchText(left) === normalizeSearchText(right))
}

function isDistinct(candidate: string | null, fingerprints: Array<string | null | undefined>): candidate is string {
  return Boolean(candidate) && !fingerprints.some((fingerprint) => equivalent(candidate, fingerprint))
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
