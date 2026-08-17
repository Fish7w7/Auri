import type Database from 'better-sqlite3'
import type { ReadingHistory } from '@shared/types/domain'

interface HistoryRow {
  id: string
  work_id: string
  source_id: string | null
  event_type: ReadingHistory['eventType']
  old_chapter_label: string | null
  old_chapter_number: number | null
  new_chapter_label: string | null
  new_chapter_number: number | null
  source_name_snapshot: string | null
  source_domain_snapshot: string | null
  note: string | null
  reverts_history_id: string | null
  occurred_at: string
  created_at: string
}

const HISTORY_COLUMNS = `id, work_id, source_id, event_type,
  old_chapter_label, old_chapter_number, new_chapter_label, new_chapter_number,
  source_name_snapshot, source_domain_snapshot, note, reverts_history_id,
  occurred_at, created_at`

export class HistoryRepository {
  constructor(private readonly db: Database.Database) {}

  create(history: ReadingHistory): ReadingHistory {
    this.db
      .prepare(`
        INSERT INTO reading_history (${HISTORY_COLUMNS}) VALUES (
          @id, @workId, @sourceId, @eventType,
          @oldLabel, @oldNumber, @newLabel, @newNumber,
          @sourceNameSnapshot, @sourceDomainSnapshot, @note, @revertsHistoryId,
          @occurredAt, @createdAt
        )
      `)
      .run(this.params(history))
    return history
  }

  findById(id: string): ReadingHistory | null {
    const row = this.db
      .prepare(`SELECT ${HISTORY_COLUMNS} FROM reading_history WHERE id = ?`)
      .get(id) as HistoryRow | undefined
    return row ? this.map(row) : null
  }

  listByWork(workId: string): ReadingHistory[] {
    return (
      this.db
        .prepare(`SELECT ${HISTORY_COLUMNS} FROM reading_history WHERE work_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC`)
        .all(workId) as HistoryRow[]
    ).map((row) => this.map(row))
  }

  findLatestByWork(workId: string): ReadingHistory | null {
    const row = this.db
      .prepare(`
        SELECT ${HISTORY_COLUMNS} FROM reading_history
        WHERE work_id = ? ORDER BY occurred_at DESC, created_at DESC, rowid DESC LIMIT 1
      `)
      .get(workId) as HistoryRow | undefined
    return row ? this.map(row) : null
  }

  findUndoFor(historyId: string): ReadingHistory | null {
    const row = this.db
      .prepare(`SELECT ${HISTORY_COLUMNS} FROM reading_history WHERE reverts_history_id = ? LIMIT 1`)
      .get(historyId) as HistoryRow | undefined
    return row ? this.map(row) : null
  }

  private params(history: ReadingHistory): Record<string, unknown> {
    return {
      id: history.id,
      workId: history.workId,
      sourceId: history.sourceId,
      eventType: history.eventType,
      oldLabel: history.oldChapter?.label ?? null,
      oldNumber: history.oldChapter?.number ?? null,
      newLabel: history.newChapter?.label ?? null,
      newNumber: history.newChapter?.number ?? null,
      sourceNameSnapshot: history.sourceNameSnapshot,
      sourceDomainSnapshot: history.sourceDomainSnapshot,
      note: history.note,
      revertsHistoryId: history.revertsHistoryId,
      occurredAt: history.occurredAt,
      createdAt: history.createdAt
    }
  }

  private map(row: HistoryRow): ReadingHistory {
    return {
      id: row.id,
      workId: row.work_id,
      sourceId: row.source_id,
      eventType: row.event_type,
      oldChapter:
        row.old_chapter_label === null
          ? null
          : { label: row.old_chapter_label, number: row.old_chapter_number },
      newChapter:
        row.new_chapter_label === null
          ? null
          : { label: row.new_chapter_label, number: row.new_chapter_number },
      sourceNameSnapshot: row.source_name_snapshot,
      sourceDomainSnapshot: row.source_domain_snapshot,
      note: row.note,
      revertsHistoryId: row.reverts_history_id,
      occurredAt: row.occurred_at,
      createdAt: row.created_at
    }
  }
}
