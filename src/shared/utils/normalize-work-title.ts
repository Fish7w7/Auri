import { normalizeSearchText } from './normalize-search-text'

export interface ComparablePageTitleInput {
  title?: string | null
  siteName?: string | null
  siteNames?: readonly (string | null | undefined)[]
  domain?: string | null
}

export function comparablePageTitles(input: ComparablePageTitleInput): string[] {
  return [...new Set(humanPageTitles(input).map(normalizeSearchText).filter(Boolean))]
}

export function preferredHumanPageTitle(input: ComparablePageTitleInput): string | null {
  return humanPageTitles(input).at(-1) ?? null
}

export function humanPageTitles(input: ComparablePageTitleInput): string[] {
  const title = input.title?.trim()
  if (!title) return []

  const variants = new Set<string>([title])
  const siteLabels = [input.siteName, ...(input.siteNames ?? []), domainLabel(input.domain)]
    .map((value) => value ? normalizeSearchText(value) : '')
    .filter(Boolean)

  let pending = [title]
  while (pending.length) {
    const next: string[] = []
    for (const value of pending) {
      const candidates = [stripKnownSiteSuffix(value, siteLabels), stripPromotionalSuffix(value), stripChapterSuffix(value)]
      for (const candidate of candidates) {
        if (!candidate || candidate === value || variants.has(candidate)) continue
        variants.add(candidate)
        next.push(candidate)
      }
    }
    pending = next
  }

  return [...variants]
}

function stripKnownSiteSuffix(value: string, siteLabels: string[]): string | null {
  const suffix = value.match(/^(.*?)\s*(?:\||[-–—:])\s*([^|–—:]+)$/u)
  return suffix && siteLabels.includes(normalizeSearchText(suffix[2])) ? suffix[1].trim() : null
}

function stripPromotionalSuffix(value: string): string | null {
  const suffix = value.match(/^(.*?)\s+(?:[-–—|:])\s*(?:ler|leia)\s+online(?:\s+gr[aá]tis)?\s*$/iu)
  return suffix?.[1]?.trim() || null
}

function stripChapterSuffix(value: string): string | null {
  const suffix = value.match(/^(.*?)\s*(?:[-–—|:]\s*)?(?:cap(?:[íi]tulo)?\.?|chapter)\s*#?\s*(?:\d+(?:[.,]\d+)?|pr[oó]logo|extra|especial)\s*$/iu)
  return suffix?.[1]?.trim() || null
}

function domainLabel(domain: string | null | undefined): string | null {
  if (!domain) return null
  const hostname = domain.replace(/^www\./i, '').split(':')[0]
  return hostname.split('.')[0] || null
}
