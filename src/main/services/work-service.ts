import type Database from 'better-sqlite3'
import type { CreateWorkRequest, UpdateWorkRequest } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { createWorkSchema, updateWorkSchema, workIdSchema } from '@shared/schemas/domain'
import type { Alias, ExternalRef, ReadingHistory, Work } from '@shared/types/domain'
import { normalizeChapterInput } from '@shared/utils/normalize-chapter'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { AliasRepository } from '../database/repositories/alias-repository'
import type { ExternalRefRepository } from '../database/repositories/external-ref-repository'
import type { HistoryRepository } from '../database/repositories/history-repository'
import type { MetadataOverrideRepository } from '../database/repositories/metadata-override-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import {
  generateId,
  parseDomainInput,
  requireText,
  utcNow,
  type Clock,
  type IdGenerator
} from './service-utils'

export interface WorkServiceRepositories {
  works: WorkRepository
  aliases: AliasRepository
  externalRefs: ExternalRefRepository
  history: HistoryRepository
  overrides: MetadataOverrideRepository
}

export class WorkService {
  constructor(
    private readonly db: Database.Database,
    private readonly repositories: WorkServiceRepositories,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {}

  createWork(input: unknown): Work {
    const request = parseDomainInput(createWorkSchema, input) as CreateWorkRequest
    const now = this.clock()
    const initialChapter =
      request.chapter === null || request.chapter === undefined
        ? null
        : this.normalizeChapter(request.chapter)

    const work: Work = {
      id: this.idGenerator(),
      title: request.title,
      normalizedTitle: normalizeSearchText(request.title),
      mediaType: request.mediaType,
      userStatus: request.userStatus,
      publicationStatus: request.publicationStatus ?? null,
      description: requireText(request.description),
      countryCode: requireText(request.countryCode),
      startDate: request.startDate ?? null,
      endDate: request.endDate ?? null,
      lastReadChapter: initialChapter,
      lastReadAt: initialChapter ? now : null,
      rating: request.rating ?? null,
      favorite: request.favorite ?? false,
      notes: requireText(request.notes),
      lastReadNote: requireText(request.lastReadNote),
      cover: {
        type: request.cover?.type ?? 'none',
        sourceUrl: request.cover?.sourceUrl ?? null,
        customPath: requireText(request.cover?.customPath),
        updatedAt: request.cover ? now : null
      },
      metadataUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    }

    const create = this.db.transaction(() => {
      this.repositories.works.create(work)

      if (initialChapter) {
        this.repositories.history.create({
          id: this.idGenerator(),
          workId: work.id,
          sourceId: null,
          eventType: 'initial_progress',
          oldChapter: null,
          newChapter: initialChapter,
          sourceNameSnapshot: null,
          sourceDomainSnapshot: null,
          note: work.lastReadNote,
          revertsHistoryId: null,
          occurredAt: now,
          createdAt: now
        })
      }

      for (const item of request.aliases ?? []) this.createAlias(work.id, item, now)
      for (const item of request.externalRefs ?? []) this.createExternalRef(work.id, item, now)
      return work
    })

    return create.immediate()
  }

  getWork(input: unknown): Work {
    const { workId } = parseDomainInput(workIdSchema, input)
    const work = this.repositories.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    return work
  }

  updateWork(input: unknown): Work {
    const request = parseDomainInput(updateWorkSchema, input) as UpdateWorkRequest
    const current = this.repositories.works.findById(request.id)
    if (!current) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (current.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    const now = this.clock()
    const coverChanged = request.cover !== undefined

    const updated: Work = {
      ...current,
      title: request.title ?? current.title,
      normalizedTitle: request.title ? normalizeSearchText(request.title) : current.normalizedTitle,
      mediaType: request.mediaType ?? current.mediaType,
      userStatus: request.userStatus ?? current.userStatus,
      publicationStatus:
        request.publicationStatus === undefined ? current.publicationStatus : request.publicationStatus,
      description: request.description === undefined ? current.description : request.description,
      countryCode: request.countryCode === undefined ? current.countryCode : request.countryCode,
      startDate: request.startDate === undefined ? current.startDate : request.startDate,
      endDate: request.endDate === undefined ? current.endDate : request.endDate,
      rating: request.rating === undefined ? current.rating : request.rating,
      favorite: request.favorite ?? current.favorite,
      notes: request.notes === undefined ? current.notes : request.notes,
      lastReadNote:
        request.lastReadNote === undefined ? current.lastReadNote : request.lastReadNote,
      cover: coverChanged
        ? {
            type: request.cover!.type,
            sourceUrl: request.cover!.sourceUrl ?? null,
            customPath: request.cover!.customPath ?? null,
            updatedAt: now
          }
        : current.cover,
      updatedAt: now
    }

    const update = this.db.transaction(() => {
      this.repositories.works.update(updated)
      const metadataFields: Array<[keyof UpdateWorkRequest, string]> = [
        ['title', 'title'], ['mediaType', 'media_type'], ['publicationStatus', 'publication_status'],
        ['description', 'description'], ['countryCode', 'country_code'], ['startDate', 'start_date'],
        ['endDate', 'end_date'], ['cover', 'cover']
      ]
      for (const [requestKey, fieldKey] of metadataFields) {
        if (request[requestKey] !== undefined) {
          this.repositories.overrides.set({ workId: current.id, fieldKey, lockedAt: now })
        }
      }
      return updated
    })
    return update.immediate()
  }

  moveToTrash(input: unknown): Work {
    const { workId } = parseDomainInput(workIdSchema, input)
    const work = this.repositories.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (!work.deletedAt) this.repositories.works.softDelete(workId, this.clock())
    return this.repositories.works.findById(workId)!
  }

  restoreWork(input: unknown): Work {
    const { workId } = parseDomainInput(workIdSchema, input)
    const work = this.repositories.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) this.repositories.works.restore(workId, this.clock())
    return this.repositories.works.findById(workId)!
  }

  listTrash(): Work[] {
    return this.repositories.works.listTrash()
  }

  deletePermanently(input: unknown): void {
    const { workId } = parseDomainInput(workIdSchema, input)
    if (!this.repositories.works.deletePermanently(workId)) {
      throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    }
  }

  private createAlias(
    workId: string,
    input: NonNullable<CreateWorkRequest['aliases']>[number],
    now: string
  ): Alias {
    const normalizedName = normalizeSearchText(input.name)
    if (this.repositories.aliases.findByWorkAndNormalizedName(workId, normalizedName)) {
      throw new DomainError('DUPLICATE_ALIAS', 'Este alias já existe na obra.')
    }
    return this.repositories.aliases.create({
      id: this.idGenerator(),
      workId,
      name: input.name,
      normalizedName,
      kind: input.kind ?? null,
      source: input.source ?? null,
      createdAt: now
    })
  }

  private createExternalRef(
    workId: string,
    input: NonNullable<CreateWorkRequest['externalRefs']>[number],
    now: string
  ): ExternalRef {
    if (this.repositories.externalRefs.findByProviderExternalId(input.provider, input.externalId)) {
      throw new DomainError('DUPLICATE_EXTERNAL_REF', 'Este identificador externo já pertence a outra obra.')
    }
    return this.repositories.externalRefs.create({
      id: this.idGenerator(),
      workId,
      provider: input.provider,
      externalId: input.externalId,
      canonicalUrl: input.canonicalUrl ?? null,
      lastSyncedAt: null,
      createdAt: now
    })
  }

  private normalizeChapter(input: string): Work['lastReadChapter'] {
    try {
      return normalizeChapterInput(input)
    } catch {
      throw new DomainError('INVALID_CHAPTER', 'Capítulo inválido.')
    }
  }
}
