import type Database from 'better-sqlite3'
import type { MediaType, ReadingActivity, ReadingStatistics, ReadingStatisticsRequest, UserStatus } from '@shared/contracts'

const MAX_BUCKETS = 180
const BUCKET_SQL: Record<ReadingStatisticsRequest['groupBy'], string> = {
  day: "date(occurred_at, 'localtime')",
  week: "date(occurred_at, 'localtime', '-6 days', 'weekday 1')",
  month: "date(occurred_at, 'localtime', 'start of month')"
}
const EMPTY_ACTIVITY: ReadingActivity = { records: 0, updates: 0, advances: 0 }

type LibraryRow = { mediaType: MediaType; status: UserStatus; count: number; notStarted: number }
type ActivityRow = ReadingActivity & { section: 'total' | 'bucket' | 'rank'; key: string; title: string }

function calendarBucket(date: Date, groupBy: ReadingStatisticsRequest['groupBy']): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  if (groupBy === 'month') day.setUTCDate(1)
  if (groupBy === 'week') day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7)
  return day.toISOString().slice(0, 10)
}

function previousBucket(key: string, groupBy: ReadingStatisticsRequest['groupBy']): string {
  const date = new Date(`${key}T00:00:00Z`)
  if (groupBy === 'month') date.setUTCMonth(date.getUTCMonth() - 1)
  else date.setUTCDate(date.getUTCDate() - (groupBy === 'week' ? 7 : 1))
  return date.toISOString().slice(0, 10)
}

function counts(row: ReadingActivity | undefined): ReadingActivity {
  return row ? { records: row.records, updates: row.updates, advances: row.advances } : EMPTY_ACTIVITY
}

export function readReadingStatistics(db: Database.Database, request: ReadingStatisticsRequest, now: Date): ReadingStatistics {
  const { mediaType, status, period, groupBy } = request
  const start = period === 'all' ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - period + 1)
  const where = [
    'deleted_at IS NULL',
    ...(mediaType ? ['media_type = @mediaType'] : []),
    ...(status ? ['user_status = @status'] : [])
  ].join(' AND ')
  const filters = { mediaType: mediaType ?? null, status: status ?? null }
  const library = {
    total: 0, completed: 0, inProgress: 0, notStarted: 0,
    byStatus: {} as ReadingStatistics['library']['byStatus'],
    byMediaType: {} as ReadingStatistics['library']['byMediaType']
  }
  const libraryRows = db.prepare(`
    SELECT media_type AS mediaType, user_status AS status, count(*) AS count,
      sum(user_status = 'want_to_read' AND last_read_chapter_label IS NULL) AS notStarted
    FROM works WHERE ${where} GROUP BY media_type, user_status
  `).all(filters) as LibraryRow[]
  for (const row of libraryRows) {
    library.total += row.count
    library.notStarted += row.notStarted
    library.byStatus[row.status] = (library.byStatus[row.status] ?? 0) + row.count
    library.byMediaType[row.mediaType] = (library.byMediaType[row.mediaType] ?? 0) + row.count
  }
  library.completed = library.byStatus.completed ?? 0
  library.inProgress = (library.byStatus.reading ?? 0) + (library.byStatus.paused ?? 0) + (library.byStatus.waiting ?? 0)

  // Count a persisted event once. An undo cancels its target even if it happened after the selected window.
  const activityRows = db.prepare(`
    WITH eligible AS MATERIALIZED (SELECT id, title FROM works WHERE ${where}),
    events AS MATERIALIZED (
      SELECT h.work_id, h.occurred_at, h.event_type = 'progress_update' AS is_update,
        CASE WHEN h.event_type = 'progress_update' AND h.new_chapter_number > h.old_chapter_number THEN 1 ELSE 0 END AS is_advance
      FROM eligible w JOIN reading_history h ON h.work_id = w.id
      WHERE h.event_type IN ('initial_progress', 'progress_update', 'correction')
        AND (h.old_chapter_label IS NOT h.new_chapter_label OR h.old_chapter_number IS NOT h.new_chapter_number)
        AND julianday(h.occurred_at) <= julianday(@now)
        ${start ? 'AND julianday(h.occurred_at) >= julianday(@start)' : ''}
        AND h.id NOT IN (
          SELECT reverts_history_id FROM reading_history WHERE event_type = 'undo' AND reverts_history_id IS NOT NULL
        )
    ), buckets AS (
      SELECT ${BUCKET_SQL[groupBy]} AS bucket, count(*) AS records, sum(is_update) AS updates, sum(is_advance) AS advances
      FROM events GROUP BY bucket ORDER BY bucket DESC LIMIT ${MAX_BUCKETS + 1}
    ), ranking AS (
      SELECT w.id, w.title, count(*) AS records, sum(e.is_update) AS updates, sum(e.is_advance) AS advances
      FROM events e JOIN eligible w ON w.id = e.work_id
      GROUP BY w.id ORDER BY records DESC, w.title COLLATE NOCASE, w.id LIMIT 8
    )
    SELECT 'total' AS section, '' AS key, '' AS title, count(*) AS records,
      coalesce(sum(is_update), 0) AS updates, coalesce(sum(is_advance), 0) AS advances FROM events
    UNION ALL SELECT 'bucket', bucket, '', records, updates, advances FROM buckets
    UNION ALL SELECT 'rank', id, title, records, updates, advances FROM ranking
  `).all({ ...filters, now: now.toISOString(), start: start?.toISOString() ?? null }) as ActivityRow[]

  const buckets = activityRows.filter((row) => row.section === 'bucket').sort((a, b) => b.key.localeCompare(a.key))
  const bucketCounts = new Map(buckets.map((row) => [row.key, row]))
  const timeline: ReadingStatistics['timeline'] = []
  if (buckets.length) {
    const first = start ? calendarBucket(start, groupBy) : buckets.at(-1)!.key
    const last = start ? calendarBucket(now, groupBy) : buckets[0].key
    for (let key = last; key >= first && timeline.length < MAX_BUCKETS; key = previousBucket(key, groupBy)) {
      timeline.push({ start: key, ...counts(bucketCounts.get(key)) })
    }
  }
  timeline.reverse()
  return {
    library,
    activity: counts(activityRows.find((row) => row.section === 'total')),
    timeline,
    timelineTruncated: timeline.length > 0 && buckets.at(-1)!.key < timeline[0].start,
    ranking: activityRows.filter((row) => row.section === 'rank').map((row) => ({
      workId: row.key, title: row.title, ...counts(row)
    }))
  }
}
