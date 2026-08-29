import type Database from 'better-sqlite3'
import type {
  ImportMetadataRequest,
  MetadataApplyResult,
  MetadataDuplicate,
  MetadataFieldKey,
  MetadataRefreshChange,
  MetadataRefreshPreview,
  MetadataReview,
  MetadataSearchResult,
  MetadataWork,
  WorkDetails
} from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { metadataCancelSchema, metadataImportSchema, metadataRefreshSchema, metadataReviewSchema, metadataSearchSchema } from '@shared/schemas/domain'
import type { Work } from '@shared/types/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { AliasRepository } from '../../database/repositories/alias-repository'
import type { CreatorRepository } from '../../database/repositories/creator-repository'
import type { ExternalRefRepository } from '../../database/repositories/external-ref-repository'
import type { GenreRepository } from '../../database/repositories/genre-repository'
import type { MetadataOverrideRepository } from '../../database/repositories/metadata-override-repository'
import type { WorkRepository } from '../../database/repositories/work-repository'
import type { CoverService } from '../covers/cover-service'
import type { PreparedCover } from '../covers/types'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from '../service-utils'
import type { WorkDetailsService } from '../work-details-service'
import type { MetadataProvider } from './types'

interface MetadataRepositories {
  works: WorkRepository
  aliases: AliasRepository
  creators: CreatorRepository
  genres: GenreRepository
  externalRefs: ExternalRefRepository
  overrides: MetadataOverrideRepository
}

const FIELD_LABELS: Record<MetadataFieldKey, string> = {
  title: 'Título', description: 'Descrição', media_type: 'Tipo de mídia', publication_status: 'Publicação',
  country_code: 'País', start_date: 'Início', end_date: 'Término', aliases: 'Títulos alternativos',
  creators: 'Creators', genres: 'Gêneros', cover: 'Capa'
}

export class MetadataService {
  private readonly providers = new Map<string, MetadataProvider>()
  private readonly searchCache = new Map<string, MetadataSearchResult[]>()
  private readonly searchInflight = new Map<string, Promise<MetadataSearchResult[]>>()
  private readonly detailsCache = new Map<string, MetadataWork>()
  private readonly requests = new Map<string, AbortController>()

  constructor(
    private readonly db: Database.Database,
    providers: MetadataProvider[],
    private readonly repositories: MetadataRepositories,
    private readonly details: WorkDetailsService,
    private readonly covers: CoverService,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {
    for (const provider of providers) this.providers.set(provider.id, provider)
  }

  async search(input: unknown): Promise<MetadataSearchResult[]> {
    const request = parseDomainInput(metadataSearchSchema, input)
    const provider = this.requireProvider(request.provider)
    const key = `${provider.id}:${normalizeSearchText(request.query)}`
    const cached = this.searchCache.get(key)
    if (cached) return cached
    return this.runRequest(request.requestId, async (signal) => {
      const active = request.requestId ? undefined : this.searchInflight.get(key)
      if (active) return active
      const promise = provider.search(request.query, signal).then((results) => {
        const limited = results.slice(0, 10)
        this.searchCache.set(key, limited)
        return limited
      })
      if (!request.requestId) this.searchInflight.set(key, promise)
      try { return await promise } finally { if (!request.requestId) this.searchInflight.delete(key) }
    })
  }

  async review(input: unknown): Promise<MetadataReview> {
    const request = parseDomainInput(metadataReviewSchema, input)
    return this.runRequest(request.requestId, async (signal) => {
      const metadata = await this.fetchDetails(request.provider, request.externalId, false, signal)
      return { metadata, duplicate: this.findDuplicate(metadata) }
    })
  }

  async import(input: unknown): Promise<WorkDetails> {
    const request = parseDomainInput(metadataImportSchema, input) as ImportMetadataRequest & { requestId?: string }
    return this.runRequest(request.requestId, async (signal) => {
      const metadata = await this.fetchDetails(request.provider, request.externalId, false, signal)
      const duplicate = this.findDuplicate(metadata)
    if (duplicate?.kind === 'active') this.throwDuplicate('METADATA_DUPLICATE_ACTIVE', duplicate)
    if (duplicate?.kind === 'trash') this.throwDuplicate('METADATA_DUPLICATE_TRASH', duplicate)
    if (duplicate?.kind === 'probable' && !request.allowProbableDuplicate) this.throwDuplicate('METADATA_PROBABLE_DUPLICATE', duplicate)
    const now = this.clock()
    const operation = this.db.transaction(() => {
      const created = this.details.createDetailed({
        title: request.title,
        mediaType: request.mediaType,
        userStatus: request.userStatus,
        publicationStatus: metadata.publicationStatus,
        description: metadata.description,
        countryCode: metadata.countryCode,
        startDate: metadata.startDate,
        endDate: metadata.endDate,
        chapter: request.chapter,
        lastReadNote: request.lastReadNote,
        cover: metadata.coverUrl ? { type: 'remote', sourceUrl: metadata.coverUrl } : undefined,
        aliases: metadata.aliases.map((alias) => ({ ...alias, source: metadata.provider })),
        externalRefs: [{ provider: metadata.provider, externalId: metadata.externalId, canonicalUrl: metadata.canonicalUrl }],
        creators: metadata.creators.map((creator) => ({ ...creator, source: metadata.provider })),
        genres: metadata.genres,
        source: request.source
      })
      const work = this.repositories.works.findById(created.work.id)!
      this.repositories.works.update({ ...work, metadataUpdatedAt: now, updatedAt: now })
      const reference = this.repositories.externalRefs.findByWorkAndProvider(work.id, metadata.provider)!
      this.repositories.externalRefs.update({ ...reference, canonicalUrl: metadata.canonicalUrl, lastSyncedAt: now })
      return this.details.getDetails({ workId: work.id })
    })
      return operation.immediate()
    })
  }

  async previewRefresh(input: unknown): Promise<MetadataRefreshPreview> {
    const { workId, requestId } = parseDomainInput(metadataRefreshSchema, input)
    const current = this.requireWorkDetails(workId)
    const reference = this.requireSupportedReference(current)
    return this.runRequest(requestId, async (signal) => {
      const metadata = await this.fetchDetails(reference.provider, reference.externalId, true, signal)
      return { workId, provider: reference.provider, externalId: reference.externalId, changes: this.compare(current, metadata), externalRef: reference }
    })
  }

  async applyRefresh(input: unknown): Promise<MetadataApplyResult> {
    const { workId, requestId } = parseDomainInput(metadataRefreshSchema, input)
    const current = this.requireWorkDetails(workId)
    const reference = this.requireSupportedReference(current)
    return this.runRequest(requestId, async (signal) => {
      const metadata = await this.fetchDetails(reference.provider, reference.externalId, true, signal)
      const protectedFields = this.protectedFields(current)
      const warnings: string[] = []
    let prepared: PreparedCover | null = null
    if (metadata.coverUrl && metadata.coverUrl !== current.work.cover.sourceUrl && !protectedFields.has('cover') && current.work.cover.type !== 'custom') {
      try { prepared = await this.covers.prepareRemoteCover(workId, metadata.coverUrl) }
      catch { warnings.push('A capa não pôde ser atualizada; a imagem anterior foi preservada.') }
    }
    const now = this.clock()
    const operation = this.db.transaction(() => {
      const work = this.repositories.works.findById(workId)!
      const incoming: Work = {
        ...work,
        title: protectedFields.has('title') ? work.title : metadata.title,
        normalizedTitle: protectedFields.has('title') ? work.normalizedTitle : normalizeSearchText(metadata.title),
        mediaType: protectedFields.has('media_type') || !metadata.mediaType ? work.mediaType : metadata.mediaType,
        publicationStatus: protectedFields.has('publication_status') ? work.publicationStatus : metadata.publicationStatus,
        description: protectedFields.has('description') ? work.description : metadata.description,
        countryCode: protectedFields.has('country_code') ? work.countryCode : metadata.countryCode,
        startDate: protectedFields.has('start_date') ? work.startDate : metadata.startDate,
        endDate: protectedFields.has('end_date') ? work.endDate : metadata.endDate,
        cover: prepared && metadata.coverUrl ? { type: 'remote', sourceUrl: metadata.coverUrl, customPath: null, updatedAt: now } : work.cover,
        metadataUpdatedAt: now,
        updatedAt: now
      }
      this.repositories.works.update(incoming)
      if (!protectedFields.has('aliases')) this.replaceAliases(workId, metadata)
      if (!protectedFields.has('creators')) this.replaceCreators(workId, metadata)
      if (!protectedFields.has('genres')) this.replaceGenres(workId, metadata)
      this.repositories.externalRefs.update({ ...reference, canonicalUrl: metadata.canonicalUrl, lastSyncedAt: now })
    })
    operation.immediate()
    if (prepared) {
      try { this.covers.commitPrepared(prepared) }
      catch { warnings.push('Os dados foram atualizados, mas a nova capa não pôde ser gravada no cache.') }
    }
      return { details: this.details.getDetails({ workId }), warnings }
    })
  }

  cancel(input: unknown): void {
    const { requestId } = parseDomainInput(metadataCancelSchema, input)
    this.requests.get(requestId)?.abort()
  }

  private compare(current: WorkDetails, metadata: MetadataWork): MetadataRefreshChange[] {
    const protectedFields = this.protectedFields(current)
    const values: Array<[MetadataFieldKey, string | null, string | null]> = [
      ['title', current.work.title, metadata.title], ['description', current.work.description, metadata.description],
      ['media_type', current.work.mediaType, metadata.mediaType], ['publication_status', current.work.publicationStatus, metadata.publicationStatus],
      ['country_code', current.work.countryCode, metadata.countryCode], ['start_date', current.work.startDate, metadata.startDate],
      ['end_date', current.work.endDate, metadata.endDate],
      ['aliases', this.join(current.aliases.map((item) => item.name)), this.join(metadata.aliases.map((item) => item.name))],
      ['creators', this.join(current.creators.map((item) => `${item.name} (${item.role})`)), this.join(metadata.creators.map((item) => `${item.name} (${item.role})`))],
      ['genres', this.join(current.genres.map((item) => item.name)), this.join(metadata.genres)],
      ['cover', current.work.cover.sourceUrl, metadata.coverUrl]
    ]
    return values.filter(([, oldValue, newValue]) => oldValue !== newValue).map(([field, oldValue, newValue]) => ({ field, label: FIELD_LABELS[field], current: oldValue, incoming: newValue, protected: protectedFields.has(field) }))
  }

  private protectedFields(details: WorkDetails): Set<string> {
    const fields = new Set(details.metadataOverrides.map((item) => item.fieldKey))
    if (details.work.cover.type === 'custom') fields.add('cover')
    return fields
  }

  private replaceAliases(workId: string, metadata: MetadataWork): void {
    this.repositories.aliases.deleteByWorkAndSource(workId, metadata.provider)
    for (const alias of metadata.aliases) {
      const normalizedName = normalizeSearchText(alias.name)
      if (!this.repositories.aliases.findByWorkAndNormalizedName(workId, normalizedName)) this.repositories.aliases.create({ id: this.idGenerator(), workId, name: alias.name, normalizedName, kind: alias.kind, source: metadata.provider, createdAt: this.clock() })
    }
  }

  private replaceCreators(workId: string, metadata: MetadataWork): void {
    this.repositories.creators.deleteByWorkAndSource(workId, metadata.provider)
    for (const creator of metadata.creators) {
      const normalizedName = normalizeSearchText(creator.name)
      if (!this.repositories.creators.findDuplicate(workId, normalizedName, creator.role)) this.repositories.creators.create({ id: this.idGenerator(), workId, name: creator.name, normalizedName, role: creator.role, source: metadata.provider, createdAt: this.clock() })
    }
  }

  private replaceGenres(workId: string, metadata: MetadataWork): void {
    this.repositories.genres.detachAllFromWork(workId)
    for (const name of metadata.genres) {
      const normalizedName = normalizeSearchText(name)
      const genre = this.repositories.genres.findByNormalizedName(normalizedName) ?? this.repositories.genres.create({ id: this.idGenerator(), name, normalizedName })
      this.repositories.genres.attachToWork(workId, genre.id)
    }
  }

  private async fetchDetails(providerId: string, externalId: string, refresh = false, signal?: AbortSignal): Promise<MetadataWork> {
    const provider = this.requireProvider(providerId)
    const key = `${providerId}:${externalId}`
    if (!refresh && this.detailsCache.has(key)) return this.detailsCache.get(key)!
    const metadata = await provider.getById(externalId, signal)
    if (!metadata) throw new DomainError('METADATA_NOT_FOUND', 'A obra não foi encontrada no provedor.')
    this.detailsCache.set(key, metadata)
    return metadata
  }

  private async runRequest<T>(requestId: string | undefined, operation: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    if (!requestId) return operation()
    this.requests.get(requestId)?.abort()
    const controller = new AbortController()
    this.requests.set(requestId, controller)
    try { return await operation(controller.signal) }
    finally { if (this.requests.get(requestId) === controller) this.requests.delete(requestId) }
  }

  private findDuplicate(metadata: MetadataWork): MetadataDuplicate | null {
    const exact = this.repositories.externalRefs.findByProviderExternalId(metadata.provider, metadata.externalId)
    if (exact) {
      const work = this.repositories.works.findById(exact.workId)
      if (work) return { kind: work.deletedAt ? 'trash' : 'active', work }
    }
    for (const title of [metadata.title, ...metadata.aliases.map((item) => item.name)]) {
      const work = this.repositories.works.findByNormalizedTitleOrAlias(normalizeSearchText(title))
      if (work) return { kind: 'probable', work }
    }
    return null
  }

  private requireProvider(id: string): MetadataProvider {
    const provider = this.providers.get(id)
    if (!provider) throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Provedor de metadados indisponível.')
    return provider
  }

  private requireWorkDetails(workId: string): WorkDetails {
    const details = this.details.getDetails({ workId })
    if (details.work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.')
    return details
  }

  private requireSupportedReference(details: WorkDetails) {
    const reference = details.externalRefs.find((item) => this.providers.has(item.provider))
    if (!reference) throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Esta obra não possui uma referência externa compatível.')
    return reference
  }

  private throwDuplicate(code: 'METADATA_DUPLICATE_ACTIVE' | 'METADATA_DUPLICATE_TRASH' | 'METADATA_PROBABLE_DUPLICATE', duplicate: MetadataDuplicate): never {
    throw new DomainError(code, code === 'METADATA_PROBABLE_DUPLICATE' ? 'Uma obra com título semelhante já existe.' : 'Esta obra já foi importada.', { workId: duplicate.work.id, title: duplicate.work.title })
  }

  private join(values: string[]): string | null { return values.length ? [...values].sort().join(', ') : null }
}
