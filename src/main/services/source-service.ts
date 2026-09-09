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
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import type { SourceIdentityInput } from '@shared/utils/source-identity'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from './service-utils'
import type { SourceIdentityService } from './source-identity-service'

export class SourceService {
  constructor(
    private readonly db: Database.Database,
    private readonly sources: SourceRepository,
    private readonly works: WorkRepository,
    private readonly sourceIdentity: SourceIdentityService,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {}

  createSource(input: unknown, identityContext?: SourceIdentityInput): Source {
    const request = parseDomainInput(createSourceSchema, input) as CreateSourceRequest
    this.requireActiveWork(request.workId)
    if (request.status === 'archived' && request.isPreferred) {
      throw new DomainError('INVALID_STATUS', 'Uma fonte arquivada não pode ser preferida.')
    }
    const now = this.clock()
    const normalizedSeriesUrl = this.normalizeUrl(request.seriesUrl)
    const normalizedLastReadUrl = this.normalizeUrl(request.lastReadUrl)
    const preparedIdentity = identityContext ? this.sourceIdentity.resolve(identityContext) : null
    const seriesUrl = preparedIdentity?.seriesUrl ?? normalizedSeriesUrl
    const lastReadUrl = preparedIdentity && preparedIdentity.pageUrl !== preparedIdentity.seriesUrl
      ? preparedIdentity.pageUrl
      : normalizedLastReadUrl
    this.assertUrlAvailable(request.workId, seriesUrl, lastReadUrl, undefined, identityContext)
    const domain = request.domain ?? this.deriveDomain(seriesUrl ?? lastReadUrl)
    if (!domain) throw new DomainError('INVALID_INPUT', 'Informe uma URL válida para identificar a fonte.')
    const source: Source = {
      id: this.idGenerator(),
      workId: request.workId,
      name: request.name ?? null,
      domain,
      language: request.language ?? null,
      seriesUrl,
      lastReadUrl,
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

  assertExternalDraftSourceAvailable(
    input: { seriesUrl?: string | null; lastReadUrl?: string | null },
    identityContext?: SourceIdentityInput
  ): void {
    const seriesUrl = this.normalizeUrl(input.seriesUrl)
    const lastReadUrl = this.normalizeUrl(input.lastReadUrl)
    this.assertUrlAvailable(null, seriesUrl, lastReadUrl, undefined, identityContext)
  }

  updateSource(input: unknown): Source {
    const request = parseDomainInput(updateSourceSchema, input) as UpdateSourceRequest
    const current = this.requireSource(request.id)
    const seriesUrl = request.seriesUrl === undefined ? current.seriesUrl : this.normalizeUrl(request.seriesUrl)
    const lastReadUrl = request.lastReadUrl === undefined ? current.lastReadUrl : this.normalizeUrl(request.lastReadUrl)
    this.assertUrlAvailable(current.workId, seriesUrl, lastReadUrl, current.id)
    const status = request.status ?? current.status
    if (status === 'archived' && request.isPreferred === true) {
      throw new DomainError('INVALID_STATUS', 'Uma fonte arquivada não pode ser preferida.')
    }
    const updated: Source = {
      ...current,
      name: request.name === undefined ? current.name : request.name,
      domain: request.domain ?? this.deriveDomain(seriesUrl ?? lastReadUrl) ?? current.domain,
      language: request.language === undefined ? current.language : request.language,
      seriesUrl,
      lastReadUrl,
      translatorGroup:
        request.translatorGroup === undefined ? current.translatorGroup : request.translatorGroup,
      status,
      isPreferred: status === 'archived' ? false : request.isPreferred ?? current.isPreferred,
      updatedAt: this.clock()
    }
    const update = this.db.transaction(() => {
      if (updated.isPreferred) this.sources.clearPreferred(updated.workId, updated.updatedAt)
      return this.sources.update(updated)
    })
    return update.immediate()
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
      if (!this.sources.setPreferred(source.id, now)) {
        throw new DomainError('INVALID_STATUS', 'Uma fonte arquivada não pode ser preferida.')
      }
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

  reactivateSource(input: unknown): Source {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    this.requireSource(sourceId)
    this.sources.reactivate(sourceId, this.clock())
    return this.requireSource(sourceId)
  }

  markSourceUsed(input: unknown): Source {
    const { sourceId } = parseDomainInput(sourceIdSchema, input)
    const source = this.requireSource(sourceId)
    this.requireActiveWork(source.workId)
    this.sources.touchLastUsed(source.id, this.clock())
    return this.requireSource(source.id)
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

  private normalizeUrl(value: string | null | undefined): string | null {
    if (!value) return null
    const normalized = normalizeSourceUrl(value)
    if (!normalized) throw new DomainError('INVALID_INPUT', 'Informe uma URL HTTP ou HTTPS válida para a fonte.')
    return normalized
  }

  private assertUrlAvailable(
    workId: string | null,
    seriesUrl: string | null,
    lastReadUrl: string | null,
    ignoredSourceId?: string,
    identityContext?: SourceIdentityInput
  ): void {
    const incoming = [seriesUrl, lastReadUrl].filter((value): value is string => Boolean(value))
    if (!incoming.length) return
    const contexts = identityContext ? [identityContext] : incoming.map((pageUrl) => ({ pageUrl }))
    const candidates = contexts.flatMap((context) => this.sourceIdentity.findMatches(context))
      .filter((match) => match.source.id !== ignoredSourceId)
    const duplicate = candidates.find((match) => match.confidence === 'exact') ?? candidates[0]
    if (duplicate) {
      throw new DomainError('DUPLICATE_SOURCE', 'Esta fonte já pertence a uma obra da sua Biblioteca.', {
        workId: duplicate.work.id,
        workTitle: duplicate.work.title,
        sourceId: duplicate.source.id,
        sameWork: duplicate.work.id === workId
      })
    }
  }
}
