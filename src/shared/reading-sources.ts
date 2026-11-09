import type { Source } from './types/domain'
import { normalizeSourceUrl } from './utils/normalize-source-url'

function timestamp(value: string | null): number {
  return value ? Date.parse(value) || 0 : 0
}

function deterministicOrder(a: Source, b: Source): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

function validUrl(value: string | null): string | null {
  return value && normalizeSourceUrl(value) ? value.trim() : null
}

export function readingSourceUrl(source: Source): string | null {
  return validUrl(source.lastReadUrl) ?? validUrl(source.seriesUrl)
}

export function listEligibleReadingSources(sources: readonly Source[]): Source[] {
  return sources.filter((source) => source.status === 'active' && readingSourceUrl(source)).sort((a, b) =>
    timestamp(b.lastUsedAt) - timestamp(a.lastUsedAt) || Number(b.isPreferred) - Number(a.isPreferred) || deterministicOrder(a, b)
  )
}

export function selectResumeSource(sources: readonly Source[]): Source | null {
  const eligible = listEligibleReadingSources(sources)
  return eligible.find((source) => validUrl(source.lastReadUrl)) ?? eligible[0] ?? null
}

export function summarizeReadingSources(sources: readonly Source[], lastReadAt: string | null) {
  const lastUsed = sources.filter((source) => timestamp(source.lastUsedAt) > 0).sort((a, b) =>
    timestamp(b.lastUsedAt) - timestamp(a.lastUsedAt) || deterministicOrder(a, b)
  )[0]
  const eligible = listEligibleReadingSources(sources)
  return {
    lastSource: lastUsed ? lastUsed.name || lastUsed.domain : null,
    lastActivityAt: timestamp(lastUsed?.lastUsedAt ?? null) > timestamp(lastReadAt) ? lastUsed.lastUsedAt : lastReadAt,
    sourceCount: eligible.length
  }
}
