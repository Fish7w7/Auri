import type { Source, Work } from '@shared/types/domain'
import {
  deriveSeriesUrlFromChapter,
  resolveSourceIdentity,
  weakChapterSeriesCandidate,
  type SourceChapterEvidence,
  type SourceIdentity,
  type SourceIdentityInput
} from '@shared/utils/source-identity'
import { isSourceUrlAncestor } from '@shared/utils/source-url-ancestry'
import type { HistoryRepository } from '../database/repositories/history-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { WorkRepository } from '../database/repositories/work-repository'

export interface SourceIdentityMatch {
  source: Source
  work: Work
  confidence: 'exact' | 'high'
}

export class SourceIdentityService {
  constructor(
    private readonly sources: SourceRepository,
    private readonly works: WorkRepository,
    private readonly history: HistoryRepository
  ) {}

  resolve(input: SourceIdentityInput): SourceIdentity | null {
    return resolveSourceIdentity(input)
  }

  findMatches(input: SourceIdentityInput): SourceIdentityMatch[] {
    const identity = this.resolve(input)
    if (!identity) return []
    const domains = [...new Set(identity.comparisonUrls.map((url) => new URL(url).hostname.toLocaleLowerCase('en-US')))]
    return this.sources.findByDomains(domains).flatMap((source) => {
      const work = this.works.findById(source.workId)
      if (!work || work.deletedAt) return []
      const confidence = this.matchConfidence(identity, source, work)
      return confidence ? [{ source, work, confidence }] : []
    })
  }

  private matchConfidence(identity: SourceIdentity, source: Source, work: Work): SourceIdentityMatch['confidence'] | null {
    const storedUrls = [source.seriesUrl, source.lastReadUrl].filter((value): value is string => value !== null)
    const exactUrls = [identity.pageUrl, identity.canonicalUrl].filter((value): value is string => value !== null)
    if (storedUrls.some((url) => exactUrls.includes(url))) return 'exact'
    if (source.seriesUrl && identity.comparisonUrls.some((url) => isSourceUrlAncestor(source.seriesUrl!, url))) return 'high'
    if (identity.confidence === 'derived-high-confidence' && storedUrls.some((url) => isSourceUrlAncestor(identity.seriesUrl, url))) return 'high'

    const legacySeriesUrls = this.legacySeriesUrls(source, work)
    if (legacySeriesUrls.has(identity.seriesUrl)) return 'high'
    const weakIncoming = weakChapterSeriesCandidate(identity.pageUrl)
    return weakIncoming && legacySeriesUrls.has(weakIncoming) ? 'high' : null
  }

  private legacySeriesUrls(source: Source, work: Work): Set<string> {
    const evidence = this.chapterEvidence(source, work)
    const urls = [source.seriesUrl, source.lastReadUrl].filter((value): value is string => value !== null)
    return new Set(urls.flatMap((url) => evidence
      .map((chapter) => deriveSeriesUrlFromChapter(url, chapter))
      .filter((value): value is string => value !== null)))
  }

  private chapterEvidence(source: Source, work: Work): SourceChapterEvidence[] {
    const values: SourceChapterEvidence[] = []
    if (work.lastReadChapter) values.push({
      value: work.lastReadChapter.label,
      ...(work.lastReadChapter.number !== null ? { numericValue: work.lastReadChapter.number } : {}),
      confidence: 'high',
      source: 'stored-progress'
    })
    for (const event of this.history.listByWork(work.id)) {
      if (event.sourceId !== source.id || !event.newChapter) continue
      values.push({
        value: event.newChapter.label,
        ...(event.newChapter.number !== null ? { numericValue: event.newChapter.number } : {}),
        confidence: 'high',
        source: 'reading-history'
      })
    }
    return values
  }
}
