import type { PageContext, SourceSummary, WorkResolveResult, WorkSummary } from '@auri/protocol'
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import { sourceUrlSpecificity } from '@shared/utils/source-url-ancestry'
import { comparablePageTitles } from '@shared/utils/normalize-work-title'
import type { Source, Work } from '@shared/types/domain'
import type { ResolutionCandidate, WorkResolutionRepository } from '../database/repositories/work-resolution-repository'
import type { SourceIdentityService } from './source-identity-service'
import type { WorkEquivalenceService } from './work-equivalence-service'

export class WorkResolutionService {
  constructor(
    private readonly repository: WorkResolutionRepository,
    private readonly sourceIdentity: SourceIdentityService,
    private readonly workEquivalence: WorkEquivalenceService
  ) {}

  resolve(page: PageContext): WorkResolveResult {
    const identity = this.sourceIdentity.resolve({
      pageUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      detectedChapter: page.detectedChapter,
      title: page.title,
      domain: page.domain
    })
    const sourceMatches = this.sourceIdentity.findMatches({
      pageUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      detectedChapter: page.detectedChapter,
      title: page.title,
      domain: page.domain
    })
    if (sourceMatches.length) {
      const strongest = sourceMatches.some((match) => match.confidence === 'exact')
        ? sourceMatches.filter((match) => match.confidence === 'exact')
        : sourceMatches
      const specificity = Math.max(...strongest.map((match) => sourceUrlSpecificity(match.source.seriesUrl ?? match.source.lastReadUrl ?? '')))
      return this.result(strongest
        .filter((match) => sourceUrlSpecificity(match.source.seriesUrl ?? match.source.lastReadUrl ?? '') === specificity)
        .map((match) => ({
          work: match.work,
          source: match.source,
          matchedBy: 'source_url',
          confidence: match.confidence
        })))
    }

    const urls = identity?.comparisonUrls ?? [page.url].map(normalizeSourceUrl).filter((value): value is string => value !== null)
    const domain = this.hostname(urls)
    const titles = comparablePageTitles({ title: page.title, siteName: page.siteName, domain: page.domain ?? domain })
    const equivalent = this.workEquivalence.evaluatePage(titles)
    if (equivalent.status === 'high-confidence') {
      const candidate = equivalent.candidate
      const sameDomainSource = domain
        ? this.repository.findSourceForWorkByDomain(candidate.work.id, domain.toLocaleLowerCase('en-US'))
        : null
      return this.result([{
        work: candidate.work,
        source: sameDomainSource,
        matchedBy: sameDomainSource ? 'source_domain' : candidate.matchedBy,
        confidence: sameDomainSource ? 'high' : candidate.confidence
      }])
    }
    if (equivalent.status === 'ambiguous') return this.result(equivalent.candidates.map((candidate) => ({
      work: candidate.work,
      source: null,
      matchedBy: candidate.matchedBy,
      confidence: candidate.confidence
    })))
    return { status: 'not_found' }
  }

  inferSource(workId: string, pageUrl: string): Source | null {
    const matches = this.sourceIdentity.findMatches({ pageUrl })
      .filter((match) => match.work.id === workId)
      .map((match) => match.source)
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
