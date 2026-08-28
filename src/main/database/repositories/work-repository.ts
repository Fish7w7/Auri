import type Database from 'better-sqlite3'
import type { LibraryQuery, LibrarySummary } from '@shared/contracts'
import type { LibrarySort } from '@shared/types/domain'
import type { ChapterProgress, Work } from '@shared/types/domain'

interface WorkRow {
  id: string
  title: string
  normalized_title: string
  media_type: Work['mediaType']
  user_status: Work['userStatus']
  publication_status: Work['publicationStatus']
  description: string | null
  country_code: string | null
  start_date: string | null
  end_date: string | null
  last_read_chapter_label: string | null
  last_read_chapter_number: number | null
  last_read_at: string | null
  rating: number | null
  favorite: number
  hidden_from_home: number
  notes: string | null
  last_read_note: string | null
  cover_type: Work['cover']['type']
  cover_source_url: string | null
  cover_custom_path: string | null
  cover_updated_at: string | null
  metadata_updated_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const WORK_COLUMNS = `
  id, title, normalized_title, media_type, user_status, publication_status,
  description, country_code, start_date, end_date,
  last_read_chapter_label, last_read_chapter_number, last_read_at,
  rating, favorite, hidden_from_home, notes, last_read_note,
  cover_type, cover_source_url, cover_custom_path, cover_updated_at,
  metadata_updated_at, created_at, updated_at, deleted_at
`

export class WorkRepository {
  constructor(private readonly db: Database.Database) {}

  create(work: Work): Work {
    this.db
      .prepare(`
        INSERT INTO works (${WORK_COLUMNS}) VALUES (
          @id, @title, @normalizedTitle, @mediaType, @userStatus, @publicationStatus,
          @description, @countryCode, @startDate, @endDate,
          @chapterLabel, @chapterNumber, @lastReadAt,
          @rating, @favorite, @hiddenFromHome, @notes, @lastReadNote,
          @coverType, @coverSourceUrl, @coverCustomPath, @coverUpdatedAt,
          @metadataUpdatedAt, @createdAt, @updatedAt, @deletedAt
        )
      `)
      .run(this.toParams(work))
    return work
  }

  findById(id: string): Work | null {
    return this.findOne(`SELECT ${WORK_COLUMNS} FROM works WHERE id = ?`, id)
  }

  findActiveById(id: string): Work | null {
    return this.findOne(`SELECT ${WORK_COLUMNS} FROM works WHERE id = ? AND deleted_at IS NULL`, id)
  }

  update(work: Work): Work {
    this.db
      .prepare(`
        UPDATE works SET
          title = @title,
          normalized_title = @normalizedTitle,
          media_type = @mediaType,
          user_status = @userStatus,
          publication_status = @publicationStatus,
          description = @description,
          country_code = @countryCode,
          start_date = @startDate,
          end_date = @endDate,
          last_read_chapter_label = @chapterLabel,
          last_read_chapter_number = @chapterNumber,
          last_read_at = @lastReadAt,
          rating = @rating,
          favorite = @favorite,
          hidden_from_home = @hiddenFromHome,
          notes = @notes,
          last_read_note = @lastReadNote,
          cover_type = @coverType,
          cover_source_url = @coverSourceUrl,
          cover_custom_path = @coverCustomPath,
          cover_updated_at = @coverUpdatedAt,
          metadata_updated_at = @metadataUpdatedAt,
          created_at = @createdAt,
          updated_at = @updatedAt,
          deleted_at = @deletedAt
        WHERE id = @id
      `)
      .run(this.toParams(work))
    return work
  }

  updateProgress(
    id: string,
    chapter: ChapterProgress | null,
    lastReadAt: string | null,
    updatedAt: string
  ): void {
    this.db
      .prepare(`
        UPDATE works SET
          last_read_chapter_label = ?,
          last_read_chapter_number = ?,
          last_read_at = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .run(chapter?.label ?? null, chapter?.number ?? null, lastReadAt, updatedAt, id)
  }

  softDelete(id: string, deletedAt: string): void {
    this.db
      .prepare('UPDATE works SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(deletedAt, deletedAt, id)
  }

  restore(id: string, updatedAt: string): void {
    this.db
      .prepare('UPDATE works SET deleted_at = NULL, updated_at = ? WHERE id = ?')
      .run(updatedAt, id)
  }

  deletePermanently(id: string): boolean {
    return this.db.prepare('DELETE FROM works WHERE id = ?').run(id).changes > 0
  }

  listActive(query?: LibraryQuery): Work[] {
    return this.queryActive(query)
  }

  listTrash(): Work[] {
    return this.findMany(
      `SELECT ${WORK_COLUMNS} FROM works WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
    )
  }

  queryActive(query: LibraryQuery = {}): Work[] {
    const clauses = ['w.deleted_at IS NULL']
    const values: Array<string | number> = []
    const terms = [...new Set(query.search?.trim().split(/\s+/).filter(Boolean) ?? [])]

    for (const term of terms) {
      const like = `%${this.escapeLike(term)}%`
      clauses.push(`(
        w.normalized_title LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM aliases a
          WHERE a.work_id = w.id AND a.normalized_name LIKE ? ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1 FROM work_creators c
          WHERE c.work_id = w.id AND c.normalized_name LIKE ? ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1 FROM sources s
          WHERE s.work_id = w.id AND (
            s.normalized_name LIKE ? ESCAPE '\\'
            OR s.normalized_domain LIKE ? ESCAPE '\\'
          )
        )
      )`)
      values.push(like, like, like, like, like)
    }

    this.addInFilter(clauses, values, 'w.user_status', query.userStatuses)
    this.addInFilter(clauses, values, 'w.media_type', query.mediaTypes)

    if (query.publicationStatuses?.length) {
      const nonNull = query.publicationStatuses.filter((value) => value !== null)
      const parts: string[] = []
      if (nonNull.length) {
        parts.push(`w.publication_status IN (${nonNull.map(() => '?').join(', ')})`)
        values.push(...nonNull)
      }
      if (query.publicationStatuses.includes(null)) parts.push('w.publication_status IS NULL')
      clauses.push(`(${parts.join(' OR ')})`)
    }

    if (query.favorite !== undefined) {
      clauses.push('w.favorite = ?')
      values.push(query.favorite ? 1 : 0)
    }
    if (query.hiddenFromHome !== undefined) {
      clauses.push('w.hidden_from_home = ?')
      values.push(query.hiddenFromHome ? 1 : 0)
    }
    if (query.hasProgress !== undefined) {
      clauses.push(query.hasProgress ? 'w.last_read_chapter_label IS NOT NULL' : 'w.last_read_chapter_label IS NULL')
    }
    if (query.collectionIds?.length) {
      clauses.push(`EXISTS (
        SELECT 1 FROM collection_items ci
        WHERE ci.work_id = w.id AND ci.collection_id IN (${query.collectionIds.map(() => '?').join(', ')})
      )`)
      values.push(...query.collectionIds)
    }

    const limitClause = query.limit === undefined ? '' : 'LIMIT ?'
    if (query.limit !== undefined) values.push(query.limit)
    return this.findMany(
      `
        SELECT DISTINCT ${this.prefixedColumns()}
        FROM works w
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${this.getOrderBy(query.sort, 'w.')}
        ${limitClause}
      `,
      ...values
    )
  }

  listHomeReading(staleBefore: string, stale: boolean, limit: number): Work[] {
    const dateClause = stale
      ? 'last_read_at IS NOT NULL AND last_read_at <= ?'
      : '(last_read_at IS NULL OR last_read_at > ?)'
    const orderBy = stale
      ? 'last_read_at ASC'
      : 'last_read_at IS NULL ASC, last_read_at DESC, created_at DESC'
    return this.findMany(
      `SELECT ${WORK_COLUMNS} FROM works
       WHERE deleted_at IS NULL AND hidden_from_home = 0 AND user_status = 'reading' AND ${dateClause}
       ORDER BY ${orderBy} LIMIT ?`,
      staleBefore,
      limit
    )
  }

  listHomeWaiting(limit: number): Work[] {
    return this.findMany(
      `SELECT ${WORK_COLUMNS} FROM works
       WHERE deleted_at IS NULL AND hidden_from_home = 0 AND user_status = 'waiting'
       ORDER BY last_read_at IS NULL ASC, last_read_at ASC, created_at DESC LIMIT ?`,
      limit
    )
  }

  listHomeRecentlyAdded(limit: number): Work[] {
    return this.findMany(
      `SELECT ${WORK_COLUMNS} FROM works
       WHERE deleted_at IS NULL AND hidden_from_home = 0 AND user_status NOT IN ('reading', 'waiting')
       ORDER BY created_at DESC LIMIT ?`,
      limit
    )
  }

  searchActive(normalizedQuery: string, query: LibraryQuery = {}): Work[] {
    return this.queryActive({ ...query, search: normalizedQuery })
  }

  getSummary(): LibrarySummary {
    const rows = this.db
      .prepare(`
        SELECT user_status, COUNT(*) AS count
        FROM works WHERE deleted_at IS NULL GROUP BY user_status
      `)
      .all() as Array<{ user_status: Work['userStatus']; count: number }>
    const totals = this.db
      .prepare(`
        SELECT COUNT(*) AS total, COALESCE(SUM(favorite), 0) AS favorite
        FROM works WHERE deleted_at IS NULL
      `)
      .get() as { total: number; favorite: number }
    const byStatus: LibrarySummary['byStatus'] = {
      want_to_read: 0,
      reading: 0,
      paused: 0,
      waiting: 0,
      completed: 0,
      dropped: 0
    }
    for (const row of rows) byStatus[row.user_status] = row.count
    return { total: totals.total, favorite: totals.favorite, byStatus }
  }

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM works WHERE id = ?').get(id) !== undefined
  }

  findByNormalizedTitleOrAlias(normalizedTitle: string): Work | null {
    return this.findOne(`SELECT ${WORK_COLUMNS} FROM works w WHERE
      w.normalized_title = ? OR EXISTS (SELECT 1 FROM aliases a WHERE a.work_id = w.id AND a.normalized_name = ?)
      ORDER BY w.deleted_at IS NOT NULL, w.created_at LIMIT 1`, normalizedTitle, normalizedTitle)
  }

  private getOrderBy(sort: LibrarySort | undefined, prefix = ''): string {
    const fallback = `${prefix}normalized_title ASC, ${prefix}id ASC`
    switch (sort) {
      case 'last_read_asc':
        return `${prefix}last_read_at IS NULL DESC, ${prefix}last_read_at ASC, ${fallback}`
      case 'title_desc':
        return `${prefix}normalized_title DESC, ${prefix}id ASC`
      case 'created_desc':
        return `${prefix}created_at DESC, ${fallback}`
      case 'updated_desc':
        return `${prefix}updated_at DESC, ${fallback}`
      case 'chapter_desc':
        return `${prefix}last_read_chapter_number IS NULL ASC, ${prefix}last_read_chapter_number DESC, ${fallback}`
      case 'rating_desc':
        return `${prefix}rating IS NULL ASC, ${prefix}rating DESC, ${fallback}`
      case 'user_status':
        return `CASE ${prefix}user_status
          WHEN 'reading' THEN 1
          WHEN 'waiting' THEN 2
          WHEN 'want_to_read' THEN 3
          WHEN 'paused' THEN 4
          WHEN 'completed' THEN 5
          WHEN 'dropped' THEN 6
          ELSE 7
        END, ${prefix}last_read_chapter_number IS NULL ASC, ${prefix}last_read_chapter_number DESC, ${fallback}`
      case 'title_asc':
        return fallback
      default:
        return `${prefix}last_read_at IS NULL ASC, ${prefix}last_read_at DESC, ${fallback}`
    }
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`)
  }

  private addInFilter(
    clauses: string[],
    values: Array<string | number>,
    column: string,
    filter: readonly string[] | undefined
  ): void {
    if (!filter?.length) return
    clauses.push(`${column} IN (${filter.map(() => '?').join(', ')})`)
    values.push(...filter)
  }

  private prefixedColumns(): string {
    return WORK_COLUMNS.split(',')
      .map((column) => `w.${column.trim()}`)
      .join(', ')
  }

  private findOne(sql: string, ...params: unknown[]): Work | null {
    const row = this.db.prepare(sql).get(...params) as WorkRow | undefined
    return row ? this.map(row) : null
  }

  private findMany(sql: string, ...params: unknown[]): Work[] {
    return (this.db.prepare(sql).all(...params) as WorkRow[]).map((row) => this.map(row))
  }

  private toParams(work: Work): Record<string, unknown> {
    return {
      id: work.id,
      title: work.title,
      normalizedTitle: work.normalizedTitle,
      mediaType: work.mediaType,
      userStatus: work.userStatus,
      publicationStatus: work.publicationStatus,
      description: work.description,
      countryCode: work.countryCode,
      startDate: work.startDate,
      endDate: work.endDate,
      chapterLabel: work.lastReadChapter?.label ?? null,
      chapterNumber: work.lastReadChapter?.number ?? null,
      lastReadAt: work.lastReadAt,
      rating: work.rating,
      favorite: work.favorite ? 1 : 0,
      hiddenFromHome: work.hiddenFromHome ? 1 : 0,
      notes: work.notes,
      lastReadNote: work.lastReadNote,
      coverType: work.cover.type,
      coverSourceUrl: work.cover.sourceUrl,
      coverCustomPath: work.cover.customPath,
      coverUpdatedAt: work.cover.updatedAt,
      metadataUpdatedAt: work.metadataUpdatedAt,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
      deletedAt: work.deletedAt
    }
  }

  private map(row: WorkRow): Work {
    return {
      id: row.id,
      title: row.title,
      normalizedTitle: row.normalized_title,
      mediaType: row.media_type,
      userStatus: row.user_status,
      publicationStatus: row.publication_status,
      description: row.description,
      countryCode: row.country_code,
      startDate: row.start_date,
      endDate: row.end_date,
      lastReadChapter:
        row.last_read_chapter_label === null
          ? null
          : { label: row.last_read_chapter_label, number: row.last_read_chapter_number },
      lastReadAt: row.last_read_at,
      rating: row.rating,
      favorite: row.favorite === 1,
      hiddenFromHome: row.hidden_from_home === 1,
      notes: row.notes,
      lastReadNote: row.last_read_note,
      cover: {
        type: row.cover_type,
        sourceUrl: row.cover_source_url,
        customPath: row.cover_custom_path,
        updatedAt: row.cover_updated_at
      },
      metadataUpdatedAt: row.metadata_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at
    }
  }
}
