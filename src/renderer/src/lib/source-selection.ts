import type { Source } from '@shared/contracts'

export function selectBestReadingSource(sources: Source[]): Source | null {
  return sources
    .filter((source) => source.status === 'active' && (source.lastReadUrl || source.seriesUrl))
    .sort((a, b) => {
      if (a.lastUsedAt || b.lastUsedAt) {
        return (b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0) - (a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0)
      }
      return Number(b.isPreferred) - Number(a.isPreferred)
    })[0] ?? null
}
