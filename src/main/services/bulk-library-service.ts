import type Database from 'better-sqlite3'
import type {
  BulkCollectionRequest,
  BulkFavoriteRequest,
  BulkOperationResult,
  BulkStatusRequest,
  BulkTagRequest,
  BulkTrashRequest
} from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import {
  bulkCollectionSchema,
  bulkFavoriteSchema,
  bulkStatusSchema,
  bulkTagSchema,
  bulkTrashSchema
} from '@shared/schemas/domain'
import type { Work } from '@shared/types/domain'
import type { CollectionRepository } from '../database/repositories/collection-repository'
import type { TagRepository } from '../database/repositories/tag-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import { parseDomainInput, utcNow, type Clock } from './service-utils'

export interface BulkLibraryRepositories {
  works: WorkRepository
  tags: TagRepository
  collections: CollectionRepository
}

export class BulkLibraryService {
  constructor(
    private readonly db: Database.Database,
    private readonly repositories: BulkLibraryRepositories,
    private readonly clock: Clock = utcNow
  ) {}

  setStatus(input: unknown): BulkOperationResult {
    const request = parseDomainInput(bulkStatusSchema, input) as BulkStatusRequest
    return this.updateWorks(request.workIds, (work, updatedAt) => ({
      ...work,
      userStatus: request.userStatus,
      updatedAt
    }))
  }

  setFavorite(input: unknown): BulkOperationResult {
    const request = parseDomainInput(bulkFavoriteSchema, input) as BulkFavoriteRequest
    return this.updateWorks(request.workIds, (work, updatedAt) => ({
      ...work,
      favorite: request.favorite,
      updatedAt
    }))
  }

  addTag(input: unknown): BulkOperationResult {
    return this.updateTag(input, true)
  }

  removeTag(input: unknown): BulkOperationResult {
    return this.updateTag(input, false)
  }

  addCollection(input: unknown): BulkOperationResult {
    return this.updateCollection(input, true)
  }

  removeCollection(input: unknown): BulkOperationResult {
    return this.updateCollection(input, false)
  }

  moveToTrash(input: unknown): BulkOperationResult {
    const request = parseDomainInput(bulkTrashSchema, input) as BulkTrashRequest
    return this.transaction(request.workIds, (works) => {
      const deletedAt = this.clock()
      for (const work of works) this.repositories.works.softDelete(work.id, deletedAt)
    })
  }

  private updateWorks(
    workIds: string[],
    update: (work: Work, updatedAt: string) => Work
  ): BulkOperationResult {
    return this.transaction(workIds, (works) => {
      const updatedAt = this.clock()
      for (const work of works) this.repositories.works.update(update(work, updatedAt))
    })
  }

  private updateTag(input: unknown, add: boolean): BulkOperationResult {
    const request = parseDomainInput(bulkTagSchema, input) as BulkTagRequest
    return this.transaction(request.workIds, (works) => {
      if (!this.repositories.tags.findById(request.tagId)) {
        throw new DomainError('CONSTRAINT_VIOLATION', 'Tag não encontrada.')
      }
      for (const work of works) {
        if (add) this.repositories.tags.attachToWork(work.id, request.tagId)
        else this.repositories.tags.detachFromWork(work.id, request.tagId)
      }
    })
  }

  private updateCollection(input: unknown, add: boolean): BulkOperationResult {
    const request = parseDomainInput(bulkCollectionSchema, input) as BulkCollectionRequest
    return this.transaction(request.workIds, (works) => {
      if (!this.repositories.collections.findById(request.collectionId)) {
        throw new DomainError('CONSTRAINT_VIOLATION', 'Coleção não encontrada.')
      }
      const addedAt = this.clock()
      for (const work of works) {
        if (add) this.repositories.collections.addWork(request.collectionId, work.id, addedAt)
        else this.repositories.collections.removeWork(request.collectionId, work.id)
      }
    })
  }

  private transaction(workIds: string[], operation: (works: Work[]) => void): BulkOperationResult {
    const affectedIds = [...new Set(workIds)]
    const transaction = this.db.transaction(() => {
      const works = affectedIds.map((workId) => this.requireActiveWork(workId))
      operation(works)
      return { affectedIds }
    })
    return transaction.immediate()
  }

  private requireActiveWork(workId: string): Work {
    const work = this.repositories.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    return work
  }
}
