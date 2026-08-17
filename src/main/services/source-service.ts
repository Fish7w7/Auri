import type Database from 'better-sqlite3'
import type { CreateSourceRequest, UpdateSourceRequest } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import {
  createSourceSchema,
  sourceIdSchema,
  updateSourceSchema,
  workIdSchema
} from '@shared/schemas/domain'
import type { Source } from '@shared/types/domain'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from './service-utils'

export class SourceService {
  constructor(
    private readonly db: Database.Database,
    private readonly sources: SourceRepository,
    private readonly works: WorkRepository,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {}

  createSource(input: unknown): Source {
    const request = parseDomainInput(createSourceSchema, input) as CreateSourceRequest
    this.requireActiveWork(request.workId)
    if (request.status === 'archived' && request.isPreferred) {
      throw new DomainError('INVALID_STATUS', 'Uma fonte arquivada não pode ser preferida.')
    }
    const now = this.clock()
    const domain = request.domain ?? this.deriveDomain(request.seriesUrl ?? request.lastReadUrl ?? null)
    if (!domain) throw new DomainError('INVALID_INPUT', 'Informe uma URL válida para identificar a fonte.')
    const source: Source = {
      id: this.idGenerator(),
      workId: request.workId,
      name: request.name ?? null,
      domain,
      language: request.language ?? null,
      seriesUrl: request.seriesUrl ?? null,
      lastReadUrl: request.lastReadUrl ?? null,
      translatorGroup: request.translatorGroup ?? null,
      status: request.status ?? 'active',
      isPreferred: request.isPreferred ?? false,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    }

    const create = this.db.transaction(() => {
      if (source.isPreferred) this.sources.clearPreferred(source.workId, now)
      return this.sources.create(source)
    })
    return create.immediate()
  }

  updateSource(input: unknown): Source {
    const request = parseDomainInput(updateSourceSchema, input) as UpdateSourceRequest
    const current = this.requireSource(request.id)
    const updated: Source = {
      ...current,
      name: request.name === undefined ? current.name : request.name,
      domain: request.domain ?? this.deriveDomain(request.seriesUrl ?? request.lastReadUrl ?? null) ?? current.domain,
      language: request.language === undefined ? current.language : request.language,
      seriesUrl: request.seriesUrl === undefined ? current.seriesUrl : request.seriesUrl,
      lastReadUrl: request.lastReadUrl === undefined ? current.lastReadUrl : request.lastReadUrl,
      translatorGroup:
        request.translatorGroup === undefined ? current.translatorGroup : request.translatorGroup,
      status: request.status ?? current.status,
      isPreferred: request.status === 'archived' ? false : current.isPreferred,
      updatedAt: this.clock()
    }
    return this.sources.update(updated)
  }

  listByWork(input: unknown): Source[] {
    const { workId } = parseDomainInput(workIdSchema, input)
    this.requireActiveWork(workId)
    return this.sources.listByWork(workId)
  }

  setPreferredSource(input: unknown): Source {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    const source = this.requireSource(sourceId)
    if (source.status === 'archived') {
      throw new DomainError('INVALID_STATUS', 'Uma fonte arquivada não pode ser preferida.')
    }
    const now = this.clock()
    const setPreferred = this.db.transaction(() => {
      this.sources.clearPreferred(source.workId, now)
      this.sources.setPreferred(source.id, now)
    })
    setPreferred.immediate()
    return this.requireSource(source.id)
  }

  archiveSource(input: unknown): Source {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    this.requireSource(sourceId)
    this.sources.archive(sourceId, this.clock())
    return this.requireSource(sourceId)
  }

  markSourceUnavailable(input: unknown): Source {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    this.requireSource(sourceId)
    this.sources.markUnavailable(sourceId, this.clock())
    return this.requireSource(sourceId)
  }

  deleteSourcePermanently(input: unknown): void {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    if (!this.sources.deletePermanently(sourceId)) {
      throw new DomainError('SOURCE_NOT_FOUND', 'Fonte não encontrada.')
    }
  }

  private requireSource(id: string): Source {
    const source = this.sources.findById(id)
    if (!source) throw new DomainError('SOURCE_NOT_FOUND', 'Fonte não encontrada.')
    return source
  }

  private requireActiveWork(id: string): void {
    const work = this.works.findById(id)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
  }

  private deriveDomain(value: string | null): string | null {
    if (!value) return null
    try { return new URL(value).hostname.toLocaleLowerCase('en-US') || null } catch { return null }
  }
}
