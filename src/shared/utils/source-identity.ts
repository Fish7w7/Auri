import { normalizeChapter } from './normalize-chapter'
import { normalizeSourceUrl } from './normalize-source-url'
import { isSourceUrlAncestor, sourceUrlAncestorCandidates } from './source-url-ancestry'

export interface SourceChapterEvidence {
  value: string
  numericValue?: number
  confidence?: 'high' | 'medium' | 'low'
  source?: string
}

export interface SourceIdentityInput {
  pageUrl: string
  canonicalUrl?: string | null
  detectedChapter?: SourceChapterEvidence | null
  title?: string | null
  domain?: string | null
}

export interface SourceIdentity {
  seriesUrl: string
  pageUrl: string
  canonicalUrl: string | null
  comparisonUrls: string[]
  confidence: 'exact' | 'derived-high-confidence' | 'ambiguous'
}

const CHAPTER_SEGMENT = /^(?:(?:chapter|chap|ch|capitulo|capítulo|cap)[-_])?(\d+(?:[.,]\d+)?)$/iu

export function resolveSourceIdentity(input: SourceIdentityInput): SourceIdentity | null {
  const pageUrl = normalizeSourceUrl(input.pageUrl)
  if (!pageUrl) return null
  const canonicalUrl = normalizeSourceUrl(input.canonicalUrl)
  const pageSeriesUrl = deriveSeriesUrlFromChapter(pageUrl, input.detectedChapter)
  const canonicalSeriesUrl = canonicalUrl
    ? deriveSeriesUrlFromChapter(canonicalUrl, input.detectedChapter)
    : null
  const trustedCanonical = canonicalUrl && isCanonicalCompatible(
    pageUrl,
    canonicalUrl,
    pageSeriesUrl,
    canonicalSeriesUrl
  ) ? canonicalUrl : null

  const trustedCanonicalSeries = trustedCanonical ? canonicalSeriesUrl ?? trustedCanonical : null
  const seriesUrl = trustedCanonicalSeries ?? pageSeriesUrl ?? pageUrl
  const derived = seriesUrl !== pageUrl && seriesUrl !== trustedCanonical
  const comparisonUrls = [...new Set([
    pageUrl,
    ...(trustedCanonical ? [trustedCanonical] : []),
    seriesUrl
  ])]

  return {
    seriesUrl,
    pageUrl,
    canonicalUrl: trustedCanonical,
    comparisonUrls,
    confidence: derived
      ? 'derived-high-confidence'
      : canonicalUrl && !trustedCanonical
        ? 'ambiguous'
        : 'exact'
  }
}

export function deriveSeriesUrlFromChapter(
  value: string | null | undefined,
  evidence: SourceChapterEvidence | null | undefined
): string | null {
  const normalized = normalizeSourceUrl(value)
  const chapterNumber = reliableChapterNumber(evidence)
  if (!normalized || chapterNumber === null) return null
  const url = new URL(normalized)
  const segments = url.pathname.split('/').filter(Boolean)
  const lastSegment = segments.at(-1)
  if (!lastSegment || chapterNumberFromSegment(lastSegment) !== chapterNumber) return null
  segments.pop()
  if (!segments.length) return null
  url.pathname = `/${segments.join('/')}`
  const candidate = normalizeSourceUrl(url.toString())
  return candidate && sourceUrlAncestorCandidates(candidate).includes(candidate) ? candidate : null
}

export function weakChapterSeriesCandidate(value: string | null | undefined): string | null {
  const normalized = normalizeSourceUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  const segments = url.pathname.split('/').filter(Boolean)
  const lastSegment = segments.at(-1)
  if (!lastSegment || chapterNumberFromSegment(lastSegment) === null) return null
  segments.pop()
  if (!segments.length) return null
  url.pathname = `/${segments.join('/')}`
  const candidate = normalizeSourceUrl(url.toString())
  return candidate && sourceUrlAncestorCandidates(candidate).includes(candidate) ? candidate : null
}

function reliableChapterNumber(evidence: SourceChapterEvidence | null | undefined): number | null {
  if (!evidence || (evidence.confidence && evidence.confidence !== 'high')) return null
  if (evidence.numericValue !== undefined && Number.isFinite(evidence.numericValue)) return evidence.numericValue
  try { return normalizeChapter(evidence.value).numericValue } catch { return null }
}

function chapterNumberFromSegment(segment: string): number | null {
  let decoded: string
  try { decoded = decodeURIComponent(segment) } catch { return null }
  const match = CHAPTER_SEGMENT.exec(decoded)
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

function isCanonicalCompatible(
  pageUrl: string,
  canonicalUrl: string,
  pageSeriesUrl: string | null,
  canonicalSeriesUrl: string | null
): boolean {
  if (new URL(pageUrl).origin !== new URL(canonicalUrl).origin) return false
  if (canonicalUrl === pageUrl) return true
  if (pageSeriesUrl && (canonicalUrl === pageSeriesUrl || canonicalSeriesUrl === pageSeriesUrl)) return true
  return isSourceUrlAncestor(canonicalUrl, pageUrl)
}
