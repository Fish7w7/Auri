import type { PageContext, SourceSummary, WorkResolveResult, WorkSummary } from '@auri/protocol'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import type { Source, Work } from '@shared/types/domain'
import type { ResolutionCandidate, WorkResolutionRepository } from '../database/repositories/work-resolution-repository'

export class WorkResolutionService {
  constructor(private readonly repository: WorkResolutionRepository) {}

  resolve(page: PageContext): WorkResolveResult {
    const urls = [...new Set([page.url, page.canonicalUrl].map(normalizeSourceUrl).filter((value): value is string => value !== null))]
    const exactSource = this.repository.findByExactUrls(urls)
    if (exactSource.length) return this.result(exactSource)

    const title = page.title ? normalizeSearchText(page.title) : ''
    const domain = this.hostname(urls)
    if (domain && title) {
      const strong = this.repository.findByDomainAndTitle(normalizeSearchText(domain), title)
      if (strong.length) return this.result(strong.map((candidate) => ({ ...candidate, matchedBy: 'source_domain', confidence: 'high' })))
    }
    if (title) {
      const exactTitle = this.repository.findByExactTitle(title)
      if (exactTitle.length) return this.result(exactTitle)
      const possible = this.repository.findPossibleTitles(title)
      if (possible.length) return this.result(possible)
    }
    return { status: 'not_found' }
  }

  inferSource(workId: string, pageUrl: string): Source | null {
    const url = normalizeSourceUrl(pageUrl)
    if (!url) return null
    const matches = this.repository.findSourcesForWorkByUrl(workId, [url])
    return matches.length === 1 ? matches[0] : null
  }

  private result(candidates: ResolutionCandidate[]): WorkResolveResult {
    const byWork = [...new Map(candidates.map((candidate) => [candidate.work.id, candidate])).values()]
    const mapped = byWork.map((candidate) => ({
      work: this.workSummary(candidate.work),
      ...(candidate.source ? { source: this.sourceSummary(candidate.source) } : {}),
      match: { matchedBy: candidate.matchedBy, confidence: candidate.confidence }
    }))
    return mapped.length === 1 ? { status: 'matched', ...mapped[0] } : { status: 'ambiguous', candidates: mapped }
  }

  private hostname(urls: readonly string[]): string | null {
    for (const url of urls) try { return new URL(url).hostname.toLocaleLowerCase('en-US') } catch { /* URL já foi validada */ }
    return null
  }

  private workSummary(work: Work): WorkSummary {
    return {
      id: work.id,
      title: work.title,
      currentChapter: work.lastReadChapter ? {
        value: work.lastReadChapter.label,
        ...(work.lastReadChapter.number !== null ? { numericValue: work.lastReadChapter.number } : {})
      } : null,
      favorite: work.favorite
    }
  }

  private sourceSummary(source: Source): SourceSummary {
    return {
      id: source.id,
      ...(source.name ? { name: source.name } : {}),
      domain: source.domain,
      status: source.status,
      isPreferred: source.isPreferred,
      ...(source.lastReadUrl ? { lastReadUrl: source.lastReadUrl } : {})
    }
  }
}
