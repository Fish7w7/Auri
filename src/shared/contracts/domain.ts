import type { z } from 'zod'
import type {
  createSourceSchema,
  createAliasSchema,
  updateAliasSchema,
  createCreatorSchema,
  updateCreatorSchema,
  createGenreSchema,
  createTagSchema,
  createCollectionSchema,
  updateCollectionSchema,
  detailedCreateWorkSchema,
  detailedUpdateWorkSchema,
  aliasIdSchema,
  creatorIdSchema,
  genreWorkSchema,
  tagWorkSchema,
  collectionWorkSchema,
  collectionIdSchema,
  bulkStatusSchema,
  bulkFavoriteSchema,
  bulkHomeVisibilitySchema,
  bulkTagSchema,
  bulkCollectionSchema,
  bulkTrashSchema,
  remoteCoverSchema,
  openExternalSchema,
  createWorkSchema,
  historyIdSchema,
  listWorksSchema,
  numericProgressActionSchema,
  searchLibrarySchema,
  libraryQuerySchema,
  sourceIdSchema,
  updateProgressSchema,
  updateSourceSchema,
  updateWorkSchema,
  workIdSchema
} from '@shared/schemas/domain'
import type {
  ChapterProgress,
  Alias,
  Collection,
  Creator,
  Genre,
  MetadataOverride,
  ExternalRef,
  ReadingHistory,
  Source,
  SuspiciousProgressReason,
  Tag,
  Work
} from '@shared/types/domain'

export type CreateWorkRequest = z.infer<typeof createWorkSchema>
export type UpdateWorkRequest = z.infer<typeof updateWorkSchema>
export type WorkIdRequest = z.infer<typeof workIdSchema>
export type CreateSourceRequest = z.infer<typeof createSourceSchema>
export type UpdateSourceRequest = z.infer<typeof updateSourceSchema>
export type SourceIdRequest = z.infer<typeof sourceIdSchema>
export type UpdateProgressRequest = z.infer<typeof updateProgressSchema>
export type NumericProgressActionRequest = z.infer<typeof numericProgressActionSchema>
export type HistoryIdRequest = z.infer<typeof historyIdSchema>
export type ListWorksRequest = z.infer<typeof listWorksSchema>
export type SearchLibraryRequest = z.infer<typeof searchLibrarySchema>
export type LibraryQuery = z.infer<typeof libraryQuerySchema>
export type CreateAliasRequest = z.infer<typeof createAliasSchema>
export type UpdateAliasRequest = z.infer<typeof updateAliasSchema>
export type CreateCreatorRequest = z.infer<typeof createCreatorSchema>
export type UpdateCreatorRequest = z.infer<typeof updateCreatorSchema>
export type CreateGenreRequest = z.infer<typeof createGenreSchema>
export type CreateTagRequest = z.infer<typeof createTagSchema>
export type CreateCollectionRequest = z.infer<typeof createCollectionSchema>
export type UpdateCollectionRequest = z.infer<typeof updateCollectionSchema>
export type DetailedCreateWorkRequest = z.infer<typeof detailedCreateWorkSchema>
export type DetailedUpdateWorkRequest = z.infer<typeof detailedUpdateWorkSchema>
export type AliasIdRequest = z.infer<typeof aliasIdSchema>
export type CreatorIdRequest = z.infer<typeof creatorIdSchema>
export type GenreWorkRequest = z.infer<typeof genreWorkSchema>
export type TagWorkRequest = z.infer<typeof tagWorkSchema>
export type CollectionWorkRequest = z.infer<typeof collectionWorkSchema>
export type CollectionIdRequest = z.infer<typeof collectionIdSchema>
export type RemoteCoverRequest = z.infer<typeof remoteCoverSchema>
export type OpenExternalRequest = z.infer<typeof openExternalSchema>
export type BulkStatusRequest = z.infer<typeof bulkStatusSchema>
export type BulkFavoriteRequest = z.infer<typeof bulkFavoriteSchema>
export type BulkHomeVisibilityRequest = z.infer<typeof bulkHomeVisibilitySchema>
export type BulkTagRequest = z.infer<typeof bulkTagSchema>
export type BulkCollectionRequest = z.infer<typeof bulkCollectionSchema>
export type BulkTrashRequest = z.infer<typeof bulkTrashSchema>

export interface BulkOperationResult {
  affectedIds: string[]
}

export interface WorkDetails {
  work: Work
  aliases: Alias[]
  creators: Creator[]
  genres: Genre[]
  tags: Tag[]
  collections: Collection[]
  allCollections: Collection[]
  sources: Source[]
  metadataOverrides: MetadataOverride[]
  externalRefs: ExternalRef[]
}

export interface LibrarySummary {
  total: number
  favorite: number
  byStatus: Record<import('@shared/types/domain').UserStatus, number>
}

export interface HomeData {
  continueReading: Work[]
  staleReading: Work[]
  waiting: Work[]
  recentlyAdded: Work[]
}

export interface ProgressState {
  workId: string
  chapter: ChapterProgress | null
  lastReadAt: string | null
}

export type ProgressUpdateResult =
  | {
      applied: true
      progress: ProgressState
      history: ReadingHistory
      requiresConfirmation: false
    }
  | {
      applied: false
      progress: ProgressState
      requestedChapter: ChapterProgress
      requiresConfirmation: true
      reason: SuspiciousProgressReason
    }

export interface DomainApi {
  bulk: {
    setStatus(request: BulkStatusRequest): Promise<BulkOperationResult>
    setFavorite(request: BulkFavoriteRequest): Promise<BulkOperationResult>
    setHomeVisibility(request: BulkHomeVisibilityRequest): Promise<BulkOperationResult>
    addTag(request: BulkTagRequest): Promise<BulkOperationResult>
    removeTag(request: BulkTagRequest): Promise<BulkOperationResult>
    addCollection(request: BulkCollectionRequest): Promise<BulkOperationResult>
    removeCollection(request: BulkCollectionRequest): Promise<BulkOperationResult>
    moveToTrash(request: BulkTrashRequest): Promise<BulkOperationResult>
  }
  works: {
    create(request: CreateWorkRequest): Promise<Work>
    createDetailed(request: DetailedCreateWorkRequest): Promise<WorkDetails>
    get(request: WorkIdRequest): Promise<Work>
    getDetails(request: WorkIdRequest): Promise<WorkDetails>
    update(request: UpdateWorkRequest): Promise<Work>
    updateDetailed(request: DetailedUpdateWorkRequest): Promise<WorkDetails>
    list(request?: ListWorksRequest): Promise<Work[]>
    trash(request: WorkIdRequest): Promise<Work>
    listTrash(): Promise<Work[]>
    restore(request: WorkIdRequest): Promise<Work>
    deletePermanently(request: WorkIdRequest): Promise<void>
  }
  progress: {
    get(request: WorkIdRequest): Promise<ProgressState>
    update(request: UpdateProgressRequest): Promise<ProgressUpdateResult>
    increment(request: NumericProgressActionRequest): Promise<ProgressUpdateResult>
    decrement(request: NumericProgressActionRequest): Promise<ProgressUpdateResult>
    undo(request: HistoryIdRequest): Promise<ProgressUpdateResult>
    history(request: WorkIdRequest): Promise<ReadingHistory[]>
  }
  sources: {
    create(request: CreateSourceRequest): Promise<Source>
    update(request: UpdateSourceRequest): Promise<Source>
    list(request: WorkIdRequest): Promise<Source[]>
    setPreferred(request: SourceIdRequest): Promise<Source>
    archive(request: SourceIdRequest): Promise<Source>
    markUnavailable(request: SourceIdRequest): Promise<Source>
    reactivate(request: SourceIdRequest): Promise<Source>
    markUsed(request: SourceIdRequest): Promise<Source>
    deletePermanently(request: SourceIdRequest): Promise<void>
  }
  aliases: {
    list(request: WorkIdRequest): Promise<Alias[]>
    create(request: CreateAliasRequest): Promise<Alias>
    update(request: UpdateAliasRequest): Promise<Alias>
    delete(request: AliasIdRequest): Promise<void>
  }
  creators: {
    list(request: WorkIdRequest): Promise<Creator[]>
    create(request: CreateCreatorRequest): Promise<Creator>
    update(request: UpdateCreatorRequest): Promise<Creator>
    delete(request: CreatorIdRequest): Promise<void>
  }
  genres: {
    list(): Promise<Genre[]>
    create(request: CreateGenreRequest): Promise<Genre>
    addToWork(request: GenreWorkRequest): Promise<void>
    removeFromWork(request: GenreWorkRequest): Promise<void>
  }
  tags: {
    list(): Promise<Tag[]>
    create(request: CreateTagRequest): Promise<Tag>
    addToWork(request: TagWorkRequest): Promise<void>
    removeFromWork(request: TagWorkRequest): Promise<void>
  }
  collections: {
    list(): Promise<Collection[]>
    create(request: CreateCollectionRequest): Promise<Collection>
    update(request: UpdateCollectionRequest): Promise<Collection>
    delete(request: CollectionIdRequest): Promise<void>
    addWork(request: CollectionWorkRequest): Promise<void>
    removeWork(request: CollectionWorkRequest): Promise<void>
    listForWork(request: WorkIdRequest): Promise<Collection[]>
  }
  assets: {
    selectCover(request: WorkIdRequest): Promise<Work | null>
    setRemoteCover(request: RemoteCoverRequest): Promise<Work>
    removeCover(request: WorkIdRequest): Promise<Work>
    readCover(request: WorkIdRequest): Promise<string | null>
  }
  shell: {
    openExternal(request: OpenExternalRequest): Promise<void>
  }
  library: {
    search(request: SearchLibraryRequest): Promise<Work[]>
    query(request?: LibraryQuery): Promise<Work[]>
    summary(): Promise<LibrarySummary>
    home(): Promise<HomeData>
  }
}
