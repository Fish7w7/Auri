import type Database from 'better-sqlite3'
import type { Source, Work } from '@shared/types/domain'
import { WorkRepository } from './work-repository'
import { SourceRepository } from './source-repository'

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
    return this.map(rows, 'possible')
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
}
