import type Database from 'better-sqlite3'
import type {
  CreateAliasRequest, CreateCollectionRequest, CreateCreatorRequest, CreateGenreRequest,
  CreateTagRequest, DetailedCreateWorkRequest, DetailedUpdateWorkRequest, UpdateAliasRequest,
  UpdateCollectionRequest, UpdateCreatorRequest, WorkDetails
} from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import {
  aliasIdSchema, collectionIdSchema, collectionWorkSchema, createAliasSchema,
  createCollectionSchema, createCreatorSchema, createGenreSchema, createTagSchema,
  creatorIdSchema, detailedCreateWorkSchema, detailedUpdateWorkSchema, genreWorkSchema,
  tagWorkSchema, updateAliasSchema, updateCollectionSchema, updateCreatorSchema, workIdSchema
} from '@shared/schemas/domain'
import type { Alias, Collection, Creator, Genre, Tag, Work } from '@shared/types/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { AliasRepository } from '../database/repositories/alias-repository'
import type { CollectionRepository } from '../database/repositories/collection-repository'
import type { CreatorRepository } from '../database/repositories/creator-repository'
import type { GenreRepository } from '../database/repositories/genre-repository'
import type { MetadataOverrideRepository } from '../database/repositories/metadata-override-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { TagRepository } from '../database/repositories/tag-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import type { ExternalRefRepository } from '../database/repositories/external-ref-repository'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from './service-utils'
import type { SourceService } from './source-service'
import type { ProgressService } from './progress-service'
import type { WorkService } from './work-service'

export interface WorkDetailsRepositories {
  works: WorkRepository
  aliases: AliasRepository
  creators: CreatorRepository
  genres: GenreRepository
  tags: TagRepository
  collections: CollectionRepository
  sources: SourceRepository
  overrides: MetadataOverrideRepository
  externalRefs: ExternalRefRepository
}

export class WorkDetailsService {
  constructor(
    private readonly db: Database.Database,
    private readonly repositories: WorkDetailsRepositories,
    private readonly worksService: WorkService,
    private readonly sourcesService: SourceService,
    private readonly progressService: ProgressService,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {}

  getDetails(input: unknown): WorkDetails {
    const { workId } = parseDomainInput(workIdSchema, input)
    const work = this.repositories.works.findById(workId)
    if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.')
    return this.compose(work)
  }

  createDetailed(input: unknown): WorkDetails {
    const request = parseDomainInput(detailedCreateWorkSchema, input) as DetailedCreateWorkRequest
    const operation = this.db.transaction(() => {
      const hasExplicitSourceProgress = request.source !== undefined && request.chapter !== null && request.chapter !== undefined
      const work = this.worksService.createWork(hasExplicitSourceProgress ? { ...request, chapter: null } : request)
      for (const creator of request.creators ?? []) this.createCreatorRecord(work.id, creator)
      for (const name of request.genres ?? []) this.attachGenreName(work.id, name)
      for (const name of request.tags ?? []) this.attachTagName(work.id, name)
      for (const collectionId of request.collectionIds ?? []) {
        this.requireCollection(collectionId)
        this.repositories.collections.addWork(collectionId, work.id, this.clock())
      }
      const source = request.source ? this.sourcesService.createSource({ ...request.source, workId: work.id }) : null
      if (hasExplicitSourceProgress && source) {
        this.progressService.initializeProgress(work.id, request.chapter!, source.id, request.lastReadNote ?? null)
      }
      return this.compose(this.repositories.works.findById(work.id)!)
    })
    return operation.immediate()
  }

  updateDetailed(input: unknown): WorkDetails {
    const request = parseDomainInput(detailedUpdateWorkSchema, input) as DetailedUpdateWorkRequest
    const operation = this.db.transaction(() => {
      const work = Object.keys(request.work).length > 1
        ? this.worksService.updateWork(request.work)
        : this.requireActiveWork(request.work.id)
      const now = this.clock()
      if (request.aliases) {
        this.repositories.aliases.deleteByWork(work.id)
        for (const alias of request.aliases) this.createAliasRecord(work.id, { ...alias, source: alias.source ?? 'user' })
        this.lock(work.id, 'aliases', now)
      }
      if (request.creators) {
        this.repositories.creators.deleteByWork(work.id)
        for (const creator of request.creators) this.createCreatorRecord(work.id, creator)
        this.lock(work.id, 'creators', now)
      }
      if (request.genres) {
        this.repositories.genres.detachAllFromWork(work.id)
        for (const name of request.genres) this.attachGenreName(work.id, name)
        this.lock(work.id, 'genres', now)
      }
      return this.compose(this.repositories.works.findById(work.id)!)
    })
    return operation.immediate()
  }

  listAliases(input: unknown): Alias[] { return this.repositories.aliases.listByWork(this.requireActiveInput(input).id) }

  createAlias(input: unknown): Alias {
    const request = parseDomainInput(createAliasSchema, input) as CreateAliasRequest
    this.requireActiveWork(request.workId)
    const result = this.createAliasRecord(request.workId, { ...request, source: request.source ?? 'user' })
    this.lock(request.workId, 'aliases')
    return result
  }

  updateAlias(input: unknown): Alias {
    const request = parseDomainInput(updateAliasSchema, input) as UpdateAliasRequest
    const current = this.repositories.aliases.findById(request.id)
    if (!current) throw new DomainError('CONSTRAINT_VIOLATION', 'Título alternativo não encontrado.')
    this.requireActiveWork(current.workId)
    const name = request.name ?? current.name
    const normalizedName = normalizeSearchText(name)
    const duplicate = this.repositories.aliases.findByWorkAndNormalizedName(current.workId, normalizedName)
    if (duplicate && duplicate.id !== current.id) throw new DomainError('DUPLICATE_ALIAS', 'Este título alternativo já está associado à obra.')
    const updated = this.repositories.aliases.update({ ...current, name, normalizedName, kind: request.kind === undefined ? current.kind : request.kind, source: request.source === undefined ? current.source : request.source })
    this.lock(current.workId, 'aliases')
    return updated
  }

  deleteAlias(input: unknown): void {
    const { aliasId } = parseDomainInput(aliasIdSchema, input)
    const current = this.repositories.aliases.findById(aliasId)
    if (!current) throw new DomainError('CONSTRAINT_VIOLATION', 'Título alternativo não encontrado.')
    this.requireActiveWork(current.workId)
    this.repositories.aliases.delete(aliasId)
    this.lock(current.workId, 'aliases')
  }

  listCreators(input: unknown): Creator[] { return this.repositories.creators.listByWork(this.requireActiveInput(input).id) }

  createCreator(input: unknown): Creator {
    const request = parseDomainInput(createCreatorSchema, input) as CreateCreatorRequest
    this.requireActiveWork(request.workId)
    const result = this.createCreatorRecord(request.workId, request)
    this.lock(request.workId, 'creators')
    return result
  }

  updateCreator(input: unknown): Creator {
    const request = parseDomainInput(updateCreatorSchema, input) as UpdateCreatorRequest
    const current = this.repositories.creators.findById(request.id)
    if (!current) throw new DomainError('CONSTRAINT_VIOLATION', 'Creator não encontrado.')
    this.requireActiveWork(current.workId)
    const name = request.name ?? current.name
    const role = request.role ?? current.role
    const normalizedName = normalizeSearchText(name)
    if (this.repositories.creators.findDuplicate(current.workId, normalizedName, role, current.id)) {
      throw new DomainError('CONSTRAINT_VIOLATION', 'Este creator já está associado à obra com essa função.')
    }
    const updated = this.repositories.creators.update({ ...current, name, normalizedName, role, source: request.source === undefined ? current.source : request.source })
    this.lock(current.workId, 'creators')
    return updated
  }

  deleteCreator(input: unknown): void {
    const { creatorId } = parseDomainInput(creatorIdSchema, input)
    const current = this.repositories.creators.findById(creatorId)
    if (!current) throw new DomainError('CONSTRAINT_VIOLATION', 'Creator não encontrado.')
    this.requireActiveWork(current.workId)
    this.repositories.creators.delete(creatorId)
    this.lock(current.workId, 'creators')
  }

  listGenres(): Genre[] { return this.repositories.genres.listAll() }
  createGenre(input: unknown): Genre {
    const request = parseDomainInput(createGenreSchema, input) as CreateGenreRequest
    if (request.workId) this.requireActiveWork(request.workId)
    const genre = this.getOrCreateGenre(request.name)
    if (request.workId) { this.repositories.genres.attachToWork(request.workId, genre.id); this.lock(request.workId, 'genres') }
    return genre
  }
  addGenreToWork(input: unknown): void { const request = parseDomainInput(genreWorkSchema, input); this.requireActiveWork(request.workId); if (!this.repositories.genres.findById(request.genreId)) throw new DomainError('CONSTRAINT_VIOLATION', 'Gênero não encontrado.'); this.repositories.genres.attachToWork(request.workId, request.genreId); this.lock(request.workId, 'genres') }
  removeGenreFromWork(input: unknown): void { const request = parseDomainInput(genreWorkSchema, input); this.requireActiveWork(request.workId); this.repositories.genres.detachFromWork(request.workId, request.genreId); this.lock(request.workId, 'genres') }

  listTags(): Tag[] { return this.repositories.tags.listAll() }
  createTag(input: unknown): Tag { const request = parseDomainInput(createTagSchema, input) as CreateTagRequest; if (request.workId) this.requireActiveWork(request.workId); const tag = this.getOrCreateTag(request.name); if (request.workId) this.repositories.tags.attachToWork(request.workId, tag.id); return tag }
  addTagToWork(input: unknown): void { const request = parseDomainInput(tagWorkSchema, input); this.requireActiveWork(request.workId); if (!this.repositories.tags.findById(request.tagId)) throw new DomainError('CONSTRAINT_VIOLATION', 'Tag não encontrada.'); this.repositories.tags.attachToWork(request.workId, request.tagId) }
  removeTagFromWork(input: unknown): void { const request = parseDomainInput(tagWorkSchema, input); this.requireActiveWork(request.workId); this.repositories.tags.detachFromWork(request.workId, request.tagId) }

  listCollections(): Collection[] { return this.repositories.collections.listAll() }
  listCollectionsForWork(input: unknown): Collection[] { return this.repositories.collections.listByWork(this.requireActiveInput(input).id) }
  createCollection(input: unknown): Collection { const request = parseDomainInput(createCollectionSchema, input) as CreateCollectionRequest; if (request.workId) this.requireActiveWork(request.workId); const now = this.clock(); const collection = this.repositories.collections.create({ id: this.idGenerator(), name: request.name, description: request.description ?? null, createdAt: now, updatedAt: now }); if (request.workId) this.repositories.collections.addWork(collection.id, request.workId, now); return collection }
  updateCollection(input: unknown): Collection { const request = parseDomainInput(updateCollectionSchema, input) as UpdateCollectionRequest; const current = this.requireCollection(request.id); return this.repositories.collections.update({ ...current, name: request.name ?? current.name, description: request.description === undefined ? current.description : request.description, updatedAt: this.clock() }) }
  deleteCollection(input: unknown): void { const { collectionId } = parseDomainInput(collectionIdSchema, input); if (!this.repositories.collections.delete(collectionId)) throw new DomainError('CONSTRAINT_VIOLATION', 'Coleção não encontrada.') }
  addWorkToCollection(input: unknown): void { const request = parseDomainInput(collectionWorkSchema, input); this.requireActiveWork(request.workId); this.requireCollection(request.collectionId); this.repositories.collections.addWork(request.collectionId, request.workId, this.clock()) }
  removeWorkFromCollection(input: unknown): void { const request = parseDomainInput(collectionWorkSchema, input); this.requireActiveWork(request.workId); this.repositories.collections.removeWork(request.collectionId, request.workId) }

  private compose(work: Work): WorkDetails {
    return { work, aliases: this.repositories.aliases.listByWork(work.id), creators: this.repositories.creators.listByWork(work.id), genres: this.repositories.genres.listByWork(work.id), tags: this.repositories.tags.listByWork(work.id), collections: this.repositories.collections.listByWork(work.id), allCollections: this.repositories.collections.listAll(), sources: this.repositories.sources.listByWork(work.id), metadataOverrides: this.repositories.overrides.listByWork(work.id), externalRefs: this.repositories.externalRefs.listByWork(work.id) }
  }
  private requireActiveInput(input: unknown): Work { const { workId } = parseDomainInput(workIdSchema, input); return this.requireActiveWork(workId) }
  private requireActiveWork(id: string): Work { const work = this.repositories.works.findById(id); if (!work) throw new DomainError('WORK_NOT_FOUND', 'Obra não encontrada.'); if (work.deletedAt) throw new DomainError('WORK_IN_TRASH', 'A obra está na Lixeira.'); return work }
  private requireCollection(id: string): Collection { const collection = this.repositories.collections.findById(id); if (!collection) throw new DomainError('CONSTRAINT_VIOLATION', 'Coleção não encontrada.'); return collection }
  private createAliasRecord(workId: string, input: { name: string; kind?: string | null; source?: string | null }): Alias { const normalizedName = normalizeSearchText(input.name); if (this.repositories.aliases.findByWorkAndNormalizedName(workId, normalizedName)) throw new DomainError('DUPLICATE_ALIAS', 'Este título alternativo já está associado à obra.'); return this.repositories.aliases.create({ id: this.idGenerator(), workId, name: input.name, normalizedName, kind: input.kind ?? null, source: input.source ?? 'user', createdAt: this.clock() }) }
  private createCreatorRecord(workId: string, input: { name: string; role: string; source?: string | null }): Creator { const normalizedName = normalizeSearchText(input.name); if (this.repositories.creators.findDuplicate(workId, normalizedName, input.role)) throw new DomainError('CONSTRAINT_VIOLATION', 'Este creator já está associado à obra com essa função.'); return this.repositories.creators.create({ id: this.idGenerator(), workId, name: input.name, normalizedName, role: input.role, source: input.source ?? 'user', createdAt: this.clock() }) }
  private getOrCreateGenre(name: string): Genre { const normalizedName = normalizeSearchText(name); return this.repositories.genres.findByNormalizedName(normalizedName) ?? this.repositories.genres.create({ id: this.idGenerator(), name, normalizedName }) }
  private getOrCreateTag(name: string): Tag { const normalizedName = normalizeSearchText(name); return this.repositories.tags.findByNormalizedName(normalizedName) ?? this.repositories.tags.create({ id: this.idGenerator(), name, normalizedName, createdAt: this.clock() }) }
  private attachGenreName(workId: string, name: string): void { this.repositories.genres.attachToWork(workId, this.getOrCreateGenre(name).id) }
  private attachTagName(workId: string, name: string): void { this.repositories.tags.attachToWork(workId, this.getOrCreateTag(name).id) }
  private lock(workId: string, fieldKey: string, lockedAt = this.clock()): void { this.repositories.overrides.set({ workId, fieldKey, lockedAt }) }
}
