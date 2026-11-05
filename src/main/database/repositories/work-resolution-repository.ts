import type Database from 'better-sqlite3'
import type { Source, Work } from '@shared/types/domain'
import { WorkRepository } from './work-repository'
import { SourceRepository } from './source-repository'
import { workTitleSimilarity, workTitleTokens } from '@shared/utils/work-title-similarity'

export interface ResolutionCandidate {
  work: Work
  source: Source | null
  matchedBy: 'source_url' | 'source_domain' | 'title' | 'alias'
  confidence: 'exact' | 'high' | 'possible'
}

interface CandidateRow { work_id: string; source_id: string | null; matched_by: ResolutionCandidate['matchedBy'] }

export class WorkResolutionRepository {
  private readonly works: WorkRepository
  private readonly sources: SourceRepository

  constructor(private readonly db: Database.Database) {
    this.works = new WorkRepository(db)
    this.sources = new SourceRepository(db)
  }

  findByExactUrls(urls: readonly string[]): ResolutionCandidate[] {
    if (!urls.length) return []
    const placeholders = urls.map(() => '?').join(', ')
    const rows = this.db.prepare(`SELECT w.id AS work_id, s.id AS source_id, 'source_url' AS matched_by
      FROM sources s JOIN works w ON w.id = s.work_id
      WHERE w.deleted_at IS NULL AND (s.series_url IN (${placeholders}) OR s.last_read_url IN (${placeholders}))
      ORDER BY w.id, s.is_preferred DESC, s.id`).all(...urls, ...urls) as CandidateRow[]
    return this.map(rows, 'exact')
  }

  findByAncestralSourceUrls(urls: readonly string[]): ResolutionCandidate[] {
    return this.sources.findBySeriesUrls(urls).flatMap((source) => {
      const work = this.works.findActiveById(source.workId)
      return work ? [{ work, source, matchedBy: 'source_url' as const, confidence: 'high' as const }] : []
    })
  }

  findByDomainAndTitle(domain: string, normalizedTitle: string): ResolutionCandidate[] {
    const rows = this.db.prepare(`SELECT DISTINCT w.id AS work_id, s.id AS source_id,
      CASE WHEN w.normalized_title = ? THEN 'title' ELSE 'alias' END AS matched_by
      FROM works w JOIN sources s ON s.work_id = w.id
      WHERE w.deleted_at IS NULL AND s.normalized_domain = ? AND (
        w.normalized_title = ? OR EXISTS (SELECT 1 FROM aliases a WHERE a.work_id = w.id AND a.normalized_name = ?)
      ) ORDER BY w.id, s.is_preferred DESC, s.id`).all(normalizedTitle, domain, normalizedTitle, normalizedTitle) as CandidateRow[]
    return this.map(rows, 'high')
  }

  findByExactTitle(normalizedTitle: string): ResolutionCandidate[] {
    const rows = this.db.prepare(`SELECT DISTINCT w.id AS work_id, NULL AS source_id,
      CASE WHEN w.normalized_title = ? THEN 'title' ELSE 'alias' END AS matched_by
      FROM works w WHERE w.deleted_at IS NULL AND (
        w.normalized_title = ? OR EXISTS (SELECT 1 FROM aliases a WHERE a.work_id = w.id AND a.normalized_name = ?)
      ) ORDER BY w.id LIMIT 20`).all(normalizedTitle, normalizedTitle, normalizedTitle) as CandidateRow[]
    return this.map(rows, 'exact')
  }

  findPossibleTitles(normalizedTitle: string): ResolutionCandidate[] {
    if (normalizedTitle.length < 3) return []
    const like = `%${normalizedTitle.replace(/[\\%_]/g, (value) => `\\${value}`)}%`
    const rows = this.db.prepare(`SELECT DISTINCT w.id AS work_id, NULL AS source_id,
      CASE WHEN w.normalized_title LIKE ? ESCAPE '\\' THEN 'title' ELSE 'alias' END AS matched_by
      FROM works w WHERE w.deleted_at IS NULL AND (
        w.normalized_title LIKE ? ESCAPE '\\' OR EXISTS (
          SELECT 1 FROM aliases a WHERE a.work_id = w.id AND a.normalized_name LIKE ? ESCAPE '\\'
        )
      ) ORDER BY w.normalized_title, w.id LIMIT 20`).all(like, like, like) as CandidateRow[]
    const substring = this.map(rows, 'possible')
    const tokens = workTitleTokens(normalizedTitle).sort((a, b) => b.length - a.length).slice(0, 8)
    if (tokens.length < 2) return substring
    const params = Object.fromEntries(tokens.map((token, index) => [`token${index}`, ` ${token} `]))
    const count = (column: string) => tokens.map((_, index) => `CASE WHEN instr(' ' || ${column} || ' ', @token${index}) > 0 THEN 1 ELSE 0 END`).join(' + ')
    const byTitle = count('w.normalized_title')
    const byAlias = count('a.normalized_name')
    const partial = this.db.prepare(`SELECT w.id, w.normalized_title, a.normalized_name
      FROM works w LEFT JOIN aliases a ON a.work_id = w.id
      WHERE w.deleted_at IS NULL AND ((${byTitle}) >= 2 OR (${byAlias}) >= 2)
      ORDER BY MAX((${byTitle}), (${byAlias})) DESC, w.id LIMIT 80`).all(params) as Array<{ id: string; normalized_title: string; normalized_name: string | null }>
    const ranked = partial.map((row) => {
      const title = workTitleSimilarity(normalizedTitle, row.normalized_title)
      const alias = row.normalized_name ? workTitleSimilarity(normalizedTitle, row.normalized_name) : 0
      return { ...row, score: Math.max(title, alias), matchedBy: alias > title ? 'alias' as const : 'title' as const }
    }).filter((row) => row.score >= 0.6).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    const candidates = [...substring]
    for (const row of ranked) {
      if (candidates.length >= 20) break
      if (candidates.some((item) => item.work.id === row.id)) continue
      const work = this.works.findActiveById(row.id)
      if (work) candidates.push({ work, source: null, matchedBy: row.matchedBy, confidence: 'possible' })
      if (candidates.length >= 20) break
    }
    return candidates
  }

  hasExternalRefConflict(workId: string, references: readonly { provider: string; externalId: string }[]): boolean {
    return references.some((reference) => Boolean(this.db.prepare(`SELECT 1 FROM external_refs
      WHERE work_id = ? AND LOWER(provider) = LOWER(?) AND external_id <> ? LIMIT 1`)
      .get(workId, reference.provider, reference.externalId)))
  }

  findWorksByExternalRef(provider: string, externalId: string): Work[] {
    const rows = this.db.prepare(`SELECT DISTINCT w.id AS work_id
      FROM works w JOIN external_refs er ON er.work_id = w.id
      WHERE w.deleted_at IS NULL AND LOWER(er.provider) = LOWER(?) AND er.external_id = ?
      ORDER BY w.id`).all(provider, externalId) as Array<{ work_id: string }>
    return this.mapWorks(rows)
  }

  findWorksByCreator(normalizedName: string): Work[] {
    const rows = this.db.prepare(`SELECT DISTINCT w.id AS work_id
      FROM works w JOIN work_creators wc ON wc.work_id = w.id
      WHERE w.deleted_at IS NULL AND wc.normalized_name = ?
      ORDER BY w.id LIMIT 20`).all(normalizedName) as Array<{ work_id: string }>
    return this.mapWorks(rows)
  }

  findWorksByCoverUrl(coverUrl: string): Work[] {
    const rows = this.db.prepare(`SELECT w.id AS work_id
      FROM works w
      WHERE w.deleted_at IS NULL AND w.cover_type = 'remote' AND w.cover_source_url = ?
      ORDER BY w.id LIMIT 20`).all(coverUrl) as Array<{ work_id: string }>
    return this.mapWorks(rows)
  }

  findSourceForWorkByDomain(workId: string, normalizedDomain: string): Source | null {
    return this.sources.listByWork(workId).find((source) => source.domain.toLocaleLowerCase('en-US') === normalizedDomain) ?? null
  }

  findSourcesForWorkByUrl(workId: string, urls: readonly string[]): Source[] {
    if (!urls.length) return []
    return this.sources.listByWork(workId).filter((source) =>
      [source.seriesUrl, source.lastReadUrl].some((value) => value !== null && urls.includes(value)))
  }

  private map(rows: CandidateRow[], confidence: ResolutionCandidate['confidence']): ResolutionCandidate[] {
    const seen = new Set<string>()
    return rows.flatMap((row) => {
      const key = `${row.work_id}:${row.source_id ?? ''}`
      if (seen.has(key)) return []
      seen.add(key)
      const work = this.works.findActiveById(row.work_id)
      if (!work) return []
      return [{ work, source: row.source_id ? this.sources.findById(row.source_id) : null, matchedBy: row.matched_by, confidence }]
    })
  }

  private mapWorks(rows: Array<{ work_id: string }>): Work[] {
    return rows.flatMap((row) => {
      const work = this.works.findActiveById(row.work_id)
      return work ? [work] : []
    })
  }
}
