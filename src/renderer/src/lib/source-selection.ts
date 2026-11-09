import type { Source } from '@shared/contracts'
import { readingSourceUrl } from '@shared/reading-sources'
export { listEligibleReadingSources, readingSourceUrl, selectResumeSource } from '@shared/reading-sources'

function timestamp(value: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function deterministicOrder(a: Source, b: Source): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function selectDefaultProgressSource(sources: Source[]): Source | null {
  const active = sources.filter((source) => source.status === 'active')
  const used = active.filter((source) => timestamp(source.lastUsedAt) > 0)
    .sort((a, b) => timestamp(b.lastUsedAt) - timestamp(a.lastUsedAt) || deterministicOrder(a, b))[0]
  return used ?? active.find((source) => source.isPreferred) ?? null
}

export async function openReadingSource(source: Source, operations: {
  openExternal(url: string): Promise<void>
  markUsed(sourceId: string): Promise<Source>
}): Promise<Source> {
  const url = readingSourceUrl(source)
  if (!url) throw new Error('Esta fonte não possui uma URL utilizável.')
  await operations.openExternal(url)
  return operations.markUsed(source.id)
}
