import type { Work } from '@shared/types/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { ResolutionCandidate, WorkResolutionRepository } from '../database/repositories/work-resolution-repository'

export type WorkEquivalenceSignal =
  | 'external_id'
  | 'exact_title'
  | 'exact_alias'
  | 'exact_alternate'
  | 'creator'
  | 'cover'
  | 'fuzzy_title'

export interface WorkEquivalenceCandidate {
  work: Work
  signals: WorkEquivalenceSignal[]
  matchedBy: 'title' | 'alias'
  confidence: 'exact' | 'high' | 'possible'
}

export type WorkEquivalenceResult =
  | { status: 'high-confidence'; candidate: WorkEquivalenceCandidate }
  | { status: 'ambiguous'; candidates: WorkEquivalenceCandidate[] }
  | { status: 'none' }

export interface WorkCreationEquivalenceInput {
  title: string
  aliases?: readonly { name: string }[]
  externalRefs?: readonly { provider: string; externalId: string }[]
  creators?: readonly { name: string }[]
  coverUrl?: string | null
}

interface Evidence {
  work: Work
  signals: Set<WorkEquivalenceSignal>
  matchedBy: 'title' | 'alias'
  exactFromRawTitle: boolean
}

export class WorkEquivalenceService {
  constructor(private readonly repository: WorkResolutionRepository) {}

  evaluatePage(titles: readonly string[]): WorkEquivalenceResult {
    const normalized = uniqueNormalized(titles)
    if (!normalized.length) return { status: 'none' }
    const evidence = new Map<string, Evidence>()

    normalized.forEach((title, index) => {
      for (const candidate of this.repository.findByExactTitle(title)) {
        this.record(evidence, candidate.work, candidate.matchedBy === 'alias' ? 'exact_alias' : 'exact_title', candidate.matchedBy, index === 0)
      }
    })

    const exact = [...evidence.values()]
    if (exact.length === 1) return { status: 'high-confidence', candidate: this.toCandidate(exact[0]) }
    if (exact.length > 1) return { status: 'ambiguous', candidates: exact.map((item) => this.toCandidate(item)) }

    for (const title of normalized) {
      for (const candidate of this.repository.findPossibleTitles(title)) {
        this.record(evidence, candidate.work, 'fuzzy_title', candidate.matchedBy, false)
      }
    }
    return this.ambiguousOrNone(evidence)
  }

  evaluateCreation(input: WorkCreationEquivalenceInput): WorkEquivalenceResult {
    const evidence = new Map<string, Evidence>()
    const primaryTitle = normalizeSearchText(input.title)

    for (const reference of input.externalRefs ?? []) {
      for (const work of this.repository.findWorksByExternalRef(reference.provider, reference.externalId)) {
        this.record(evidence, work, 'external_id', 'title', false)
      }
    }

    for (const candidate of this.repository.findByExactTitle(primaryTitle)) {
      this.record(evidence, candidate.work, candidate.matchedBy === 'alias' ? 'exact_alias' : 'exact_title', candidate.matchedBy, true)
    }
    for (const alias of input.aliases ?? []) {
      for (const candidate of this.repository.findByExactTitle(normalizeSearchText(alias.name))) {
        this.record(
          evidence,
          candidate.work,
          candidate.matchedBy === 'title' ? 'exact_alias' : 'exact_alternate',
          candidate.matchedBy,
          false
        )
      }
    }
    for (const creator of input.creators ?? []) {
      for (const work of this.repository.findWorksByCreator(normalizeSearchText(creator.name))) {
        this.record(evidence, work, 'creator', 'title', false)
      }
    }
    if (input.coverUrl) {
      for (const work of this.repository.findWorksByCoverUrl(input.coverUrl)) {
        this.record(evidence, work, 'cover', 'title', false)
      }
    }
    if (primaryTitle.length >= 3) {
      for (const candidate of this.repository.findPossibleTitles(primaryTitle)) {
        this.record(evidence, candidate.work, 'fuzzy_title', candidate.matchedBy, false)
      }
    }

    const values = [...evidence.values()]
    const decisive = values.filter((item) => item.signals.has('external_id') || item.signals.has('exact_alias'))
    if (decisive.length === 1 && !this.hasContradiction(decisive[0], values)) {
      return { status: 'high-confidence', candidate: this.toCandidate(decisive[0]) }
    }
    if (decisive.length > 1) return { status: 'ambiguous', candidates: values.map((item) => this.toCandidate(item)) }

    const corroborated = values.filter((item) => item.signals.has('exact_title') && (
      item.signals.has('creator') || item.signals.has('cover')
    ))
    if (corroborated.length === 1 && !this.hasContradiction(corroborated[0], values)) {
      return { status: 'high-confidence', candidate: this.toCandidate(corroborated[0]) }
    }
    return this.ambiguousOrNone(evidence)
  }

  private hasContradiction(selected: Evidence, all: Evidence[]): boolean {
    return all.some((item) => item.work.id !== selected.work.id && (
      item.signals.has('external_id') || item.signals.has('exact_alias') ||
      item.signals.has('exact_title') || item.signals.has('cover')
    ))
  }

  private ambiguousOrNone(evidence: Map<string, Evidence>): WorkEquivalenceResult {
    const candidates = [...evidence.values()].map((item) => this.toCandidate(item))
    return candidates.length ? { status: 'ambiguous', candidates } : { status: 'none' }
  }

  private record(
    evidence: Map<string, Evidence>,
    work: Work,
    signal: WorkEquivalenceSignal,
    matchedBy: ResolutionCandidate['matchedBy'],
    exactFromRawTitle: boolean
  ): void {
    const comparableMatchedBy = matchedBy === 'alias' ? 'alias' : 'title'
    const current = evidence.get(work.id)
    if (current) {
      current.signals.add(signal)
      if (comparableMatchedBy === 'alias') current.matchedBy = 'alias'
      current.exactFromRawTitle ||= exactFromRawTitle
      return
    }
    evidence.set(work.id, { work, signals: new Set([signal]), matchedBy: comparableMatchedBy, exactFromRawTitle })
  }

  private toCandidate(evidence: Evidence): WorkEquivalenceCandidate {
    const signals = [...evidence.signals]
    const exact = evidence.exactFromRawTitle && (signals.includes('exact_title') || signals.includes('exact_alias'))
    const high = signals.some((signal) => !['fuzzy_title', 'creator', 'cover', 'exact_alternate'].includes(signal))
    return {
      work: evidence.work,
      signals,
      matchedBy: evidence.matchedBy,
      confidence: exact ? 'exact' : high ? 'high' : 'possible'
    }
  }
}

function uniqueNormalized(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeSearchText).filter(Boolean))]
}
