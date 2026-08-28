import type Database from 'better-sqlite3'
import type {
  NumericProgressActionRequest,
  ProgressState,
  ProgressUpdateResult,
  UpdateProgressRequest
} from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import {
  historyIdSchema,
  numericProgressActionSchema,
  updateProgressSchema,
  workIdSchema
} from '@shared/schemas/domain'
import type {
  ChapterProgress,
  ReadingHistory,
  Source,
  SuspiciousProgressReason,
  Work
} from '@shared/types/domain'
import { normalizeChapterInput } from '@shared/utils/normalize-chapter'
import type { HistoryRepository } from '../database/repositories/history-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from './service-utils'

export class ProgressService {
  constructor(
    private readonly db: Database.Database,
    private readonly works: WorkRepository,
    private readonly history: HistoryRepository,
    private readonly sources: SourceRepository,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId,
    private readonly largeJumpThreshold = 25
  ) {}

  getProgress(input: unknown): ProgressState {
    const { workId } = parseDomainInput(workIdSchema, input)
    return this.toProgressState(this.requireActiveWork(workId))
  }

  listHistory(input: unknown): ReadingHistory[] {
    const { workId } = parseDomainInput(workIdSchema, input)
    this.requireActiveWork(workId)
    return this.history.listByWork(workId)
  }

  updateProgress(input: unknown): ProgressUpdateResult {
    const request = parseDomainInput(updateProgressSchema, input) as UpdateProgressRequest
    const work = this.requireActiveWork(request.workId)
    const chapter = this.normalizeChapter(request.chapterLabel)
    const source = this.resolveSource(request.sourceId ?? null, work.id)

    if (this.sameChapter(work.lastReadChapter, chapter)) {
      throw new DomainError('INVALID_CHAPTER', 'O capítulo informado não altera o progresso.')
    }

    const suspicion = this.detectSuspiciousChange(work.lastReadChapter, chapter)
    if (suspicion && !request.confirmSuspicious) {
      return {
        applied: false,
        progress: this.toProgressState(work),
        requestedChapter: chapter,
        requiresConfirmation: true,
        reason: suspicion
      }
    }

    return this.applyProgressChange({
      work,
      chapter,
      source,
      note: request.note ?? null,
      occurredAt: request.occurredAt ?? this.clock(),
      eventType: request.eventType ?? 'progress_update'
    })
  }

  incrementProgress(input: unknown): ProgressUpdateResult {
    const request = parseDomainInput(numericProgressActionSchema, input) as NumericProgressActionRequest
    const work = this.requireActiveWork(request.workId)
    if (work.lastReadChapter?.number === null || work.lastReadChapter === null) {
      throw new DomainError('CHAPTER_NOT_NUMERIC', 'O progresso atual não é numérico.')
    }
    const next = work.lastReadChapter.number + 1
    const inferredSource = request.sourceId === undefined
      ? this.sources.findLastUsedByWork(work.id) ?? this.sources.listByWork(work.id).find((source) => source.status !== 'archived' && source.isPreferred) ?? null
      : null
    return this.updateProgress({
      ...request,
      sourceId: request.sourceId === undefined ? inferredSource?.id ?? null : request.sourceId,
      chapterLabel: String(next),
      confirmSuspicious: true
    })
  }

  decrementProgress(input: unknown): ProgressUpdateResult {
    const request = parseDomainInput(numericProgressActionSchema, input) as NumericProgressActionRequest
    const work = this.requireActiveWork(request.workId)
    if (work.lastReadChapter?.number === null || work.lastReadChapter === null) {
      throw new DomainError('CHAPTER_NOT_NUMERIC', 'O progresso atual não é numérico.')
    }
    const next = work.lastReadChapter.number - 1
    if (next < 0) throw new DomainError('INVALID_CHAPTER', 'O capítulo não pode ser negativo.')
    return this.updateProgress({
      ...request,
      chapterLabel: String(next),
      confirmSuspicious: true
    })
  }

  undoProgressChange(input: unknown): ProgressUpdateResult {
    const { historyId } = parseDomainInput(historyIdSchema, input)
    const target = this.history.findById(historyId)
    if (!target) throw new DomainError('HISTORY_NOT_FOUND', 'Evento de histórico não encontrado.')
    const work = this.requireActiveWork(target.workId)
    const latest = this.history.findLatestByWork(target.workId)

    if (
      latest?.id !== target.id ||
      target.eventType === 'undo' ||
      this.history.findUndoFor(target.id) ||
      !this.sameChapter(work.lastReadChapter, target.newChapter)
    ) {
      throw new DomainError('HISTORY_CANNOT_UNDO', 'Este evento não pode mais ser desfeito.')
    }

    const occurredAt = this.clock()
    const undoEvent: ReadingHistory = {
      id: this.idGenerator(),
      workId: work.id,
      sourceId: target.sourceId,
      eventType: 'undo',
      oldChapter: work.lastReadChapter,
      newChapter: target.oldChapter,
      sourceNameSnapshot: target.sourceNameSnapshot,
      sourceDomainSnapshot: target.sourceDomainSnapshot,
      note: null,
      revertsHistoryId: target.id,
      occurredAt,
      createdAt: occurredAt
    }

    const undo = this.db.transaction(() => {
      this.works.updateProgress(work.id, target.oldChapter, occurredAt, occurredAt)
      this.history.create(undoEvent)
      return this.resultFor(work.id, undoEvent)
    })
    return undo.immediate()
  }

  initializeProgress(workId: string, chapterLabel: string, sourceId: string, note: string | null): ProgressUpdateResult {
    const work = this.requireActiveWork(workId)
    if (work.lastReadChapter) throw new DomainError('INVALID_CHAPTER', 'O progresso inicial já foi definido.')
    return this.applyProgressChange({
      work,
      chapter: this.normalizeChapter(chapterLabel),
      source: this.resolveSource(sourceId, workId),
      note,
      occurredAt: this.clock(),
      eventType: 'initial_progress'
    })
  }

  detectSuspiciousChange(
    current: ChapterProgress | null,
    next: ChapterProgress
  ): SuspiciousProgressReason | null {
    if (current?.number === null || current === null || next.number === null) return null
    if (next.number < current.number) return 'regression'
    if (next.number - current.number > this.largeJumpThreshold) return 'large_jump'
    return null
  }

  private applyProgressChange(input: {
    work: Work
    chapter: ChapterProgress
    source: Source | null
    note: string | null
    occurredAt: string
    eventType: 'initial_progress' | 'progress_update' | 'correction'
  }): ProgressUpdateResult {
    const createdAt = this.clock()
    const event: ReadingHistory = {
      id: this.idGenerator(),
      workId: input.work.id,
      sourceId: input.source?.id ?? null,
      eventType: input.eventType,
      oldChapter: input.work.lastReadChapter,
      newChapter: input.chapter,
      sourceNameSnapshot: input.source?.name ?? null,
      sourceDomainSnapshot: input.source?.domain ?? null,
      note: input.note,
      revertsHistoryId: null,
      occurredAt: input.occurredAt,
      createdAt
    }

    const update = this.db.transaction(() => {
      this.works.updateProgress(input.work.id, input.chapter, input.occurredAt, createdAt)
      if (input.source) this.sources.touchLastUsed(input.source.id, input.occurredAt)
      this.history.create(event)
      return this.resultFor(input.work.id, event)
    })
    return update.immediate()
  }

  private resultFor(workId: string, history: ReadingHistory): ProgressUpdateResult {
    const work = this.works.findById(workId)!
    return {
      applied: true,
      progress: this.toProgressState(work),
      history,
      requiresConfirmation: false
    }
  }

  private requireActiveWork(id: string): Work {
    const work = this.works.findById(id)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    return work
  }

  private resolveSource(sourceId: string | null, workId: string): Source | null {
    if (!sourceId) return null
    const source = this.sources.findById(sourceId)
    if (!source || source.workId !== workId) {
      throw new DomainError('SOURCE_NOT_FOUND', 'Fonte não encontrada para esta obra.')
    }
    return source
  }

  private normalizeChapter(label: string): ChapterProgress {
    try {
      return normalizeChapterInput(label)
    } catch {
      throw new DomainError('INVALID_CHAPTER', 'Capítulo inválido.')
    }
  }

  private sameChapter(a: ChapterProgress | null, b: ChapterProgress | null): boolean {
    return a?.label === b?.label && a?.number === b?.number
  }

  private toProgressState(work: Work): ProgressState {
    return { workId: work.id, chapter: work.lastReadChapter, lastReadAt: work.lastReadAt }
  }
}
