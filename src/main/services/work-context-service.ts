import type {
  ChapterValue,
  DetectedChapter,
  PageRelation,
  WorkContextPageParams,
  WorkContextParams,
  WorkContextResult
} from '@auri/protocol'
import { DomainError } from '@shared/errors/domain-error'
import type { ChapterProgress, Source, Work } from '@shared/types/domain'
import { normalizeChapter } from '@shared/utils/normalize-chapter'
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import { sourceUrlSpecificity } from '@shared/utils/source-url-ancestry'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import type { SourceIdentityMatch, SourceIdentityService } from './source-identity-service'

export class WorkContextService {
  constructor(
    private readonly works: WorkRepository,
    private readonly sources: SourceRepository,
    private readonly sourceIdentity: SourceIdentityService
  ) {}

  getContext(params: WorkContextParams): WorkContextResult {
    const work = this.requireActiveWork(params.workId)
    const sourceContext = this.resolveSourceContext(work.id, params.page)
    const progress = chapterValue(work.lastReadChapter)

    return {
      work: {
        id: work.id,
        title: work.title,
        userStatus: work.userStatus,
        progress
      },
      page: {
        detectedChapter: params.page.detectedChapter ?? null,
        relation: getPageRelation(work.lastReadChapter, params.page.detectedChapter)
      },
      source: sourceContext.source
        ? sourceResult(sourceContext.source)
        : { state: sourceContext.state },
      continueTarget: this.continueTarget(work, sourceContext.source)
    }
  }

  findLinkedSource(workId: string, page: WorkContextPageParams): Source | null {
    this.requireActiveWork(workId)
    return this.resolveSourceContext(workId, page).source
  }

  private resolveSourceContext(
    workId: string,
    page: WorkContextPageParams
  ): { state: 'linked' | 'unlinked' | 'ambiguous'; source: Source | null } {
    const input = {
      pageUrl: page.url,
      canonicalUrl: page.canonicalUrl,
      detectedChapter: page.detectedChapter
    }
    const identity = this.sourceIdentity.resolve(input)
    if (!identity || identity.confidence === 'ambiguous') return { state: 'ambiguous', source: null }
    const requestedCanonical = normalizeSourceUrl(page.canonicalUrl)
    if (requestedCanonical && identity.canonicalUrl !== requestedCanonical) {
      return { state: 'ambiguous', source: null }
    }

    const selected = selectStrongestMatches(this.sourceIdentity.findMatches(input))
    if (!selected.length) return { state: 'unlinked', source: null }
    if (selected.some((match) => match.work.id !== workId)) return { state: 'ambiguous', source: null }

    const source = [...selected]
      .map((match) => match.source)
      .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null
    return source ? { state: 'linked', source } : { state: 'ambiguous', source: null }
  }

  private continueTarget(work: Work, matchedSource: Source | null): WorkContextResult['continueTarget'] {
    const allSources = this.sources.listByWork(work.id)
    const candidates = uniqueSources([
      matchedSource,
      this.sources.findLastUsedByWork(work.id),
      allSources.find((source) => source.status !== 'archived' && source.isPreferred) ?? null,
      ...allSources.filter((source) => source.status !== 'archived')
    ])
    for (const source of candidates) {
      const url = safeHttpUrl(source.lastReadUrl)
      if (!url) continue
      const chapter = chapterValue(work.lastReadChapter)
      return { url, ...(chapter ? { chapter } : {}) }
    }
    return null
  }

  private requireActiveWork(workId: string): Work {
    const work = this.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    return work
  }
}

export function getPageRelation(
  progress: ChapterProgress | null,
  detectedChapter: DetectedChapter | null | undefined
): PageRelation {
  if (!detectedChapter) return 'series_page'
  if (!progress) return 'unknown'

  const current = comparableChapterNumber(progress.label, progress.number)
  const page = comparableChapterNumber(detectedChapter.value, detectedChapter.numericValue)
  if (current === null || page === null) return 'unknown'
  if (page === current) return 'same'
  return page > current ? 'ahead' : 'behind'
}

function comparableChapterNumber(value: string, numericValue: number | null | undefined): number | null {
  let normalized: ReturnType<typeof normalizeChapter>
  try { normalized = normalizeChapter(value) } catch { return null }
  if (normalized.numericValue === null || numericValue === null) return null
  if (numericValue !== undefined && (!Number.isFinite(numericValue) || numericValue !== normalized.numericValue)) return null
  return normalized.numericValue
}

function chapterValue(progress: ChapterProgress | null): ChapterValue | null {
  return progress
    ? { value: progress.label, ...(progress.number !== null ? { numericValue: progress.number } : {}) }
    : null
}

function selectStrongestMatches(matches: SourceIdentityMatch[]): SourceIdentityMatch[] {
  if (!matches.length) return []
  const strongest = matches.some((match) => match.confidence === 'exact')
    ? matches.filter((match) => match.confidence === 'exact')
    : matches
  const specificity = Math.max(...strongest.map((match) => (
    sourceUrlSpecificity(match.source.seriesUrl ?? match.source.lastReadUrl ?? '')
  )))
  return strongest.filter((match) => (
    sourceUrlSpecificity(match.source.seriesUrl ?? match.source.lastReadUrl ?? '') === specificity
  ))
}

function sourceResult(source: Source): WorkContextResult['source'] {
  const seriesUrl = safeHttpUrl(source.seriesUrl)
  const lastReadUrl = safeHttpUrl(source.lastReadUrl)
  return {
    state: 'linked',
    matchedSourceId: source.id,
    ...(source.name ? { name: source.name } : {}),
    domain: source.domain,
    ...(seriesUrl ? { seriesUrl } : {}),
    ...(lastReadUrl ? { lastReadUrl } : {})
  }
}

function safeHttpUrl(value: string | null): string | null {
  return normalizeSourceUrl(value)
}

function uniqueSources(sources: Array<Source | null>): Source[] {
  return [...new Map(sources.filter((source): source is Source => source !== null)
    .map((source) => [source.id, source])).values()]
}
