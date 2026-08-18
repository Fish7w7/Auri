export type MediaType =
  | 'manhwa'
  | 'manga'
  | 'manhua'
  | 'webtoon'
  | 'novel'
  | 'light_novel'
  | 'other'

export type UserStatus =
  | 'want_to_read'
  | 'reading'
  | 'paused'
  | 'waiting'
  | 'completed'
  | 'dropped'

export type PublicationStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown'
export type SourceStatus = 'active' | 'unavailable' | 'archived'
export type CoverType = 'none' | 'remote' | 'custom'
export type HistoryEventType = 'initial_progress' | 'progress_update' | 'correction' | 'undo'
export type SuspiciousProgressReason = 'regression' | 'large_jump'
export type LibrarySort =
  | 'last_read_desc'
  | 'last_read_asc'
  | 'title_asc'
  | 'title_desc'
  | 'created_desc'
  | 'updated_desc'
  | 'chapter_desc'
  | 'rating_desc'

export type LibraryView = 'grid' | 'list'
export type CardSize = 'small' | 'medium' | 'large'

export interface ChapterProgress {
  /** Sempre representa o último capítulo concluído. */
  label: string
  number: number | null
}

export interface Work {
  id: string
  title: string
  normalizedTitle: string
  mediaType: MediaType
  userStatus: UserStatus
  publicationStatus: PublicationStatus | null
  description: string | null
  countryCode: string | null
  startDate: string | null
  endDate: string | null
  lastReadChapter: ChapterProgress | null
  lastReadAt: string | null
  rating: number | null
  favorite: boolean
  notes: string | null
  lastReadNote: string | null
  cover: {
    type: CoverType
    sourceUrl: string | null
    customPath: string | null
    updatedAt: string | null
  }
  metadataUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface Alias {
  id: string
  workId: string
  name: string
  normalizedName: string
  kind: string | null
  source: string | null
  createdAt: string
}

export interface ExternalRef {
  id: string
  workId: string
  provider: string
  externalId: string
  canonicalUrl: string | null
  lastSyncedAt: string | null
  createdAt: string
}

export interface Creator {
  id: string
  workId: string
  name: string
  normalizedName: string
  role: string
  source: string | null
  createdAt: string
}

export interface Genre {
  id: string
  name: string
  normalizedName: string
}

export interface Tag {
  id: string
  name: string
  normalizedName: string
  createdAt: string
}

export interface Collection {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  workCount?: number
}

export interface Source {
  id: string
  workId: string
  name: string | null
  domain: string
  language: string | null
  seriesUrl: string | null
  lastReadUrl: string | null
  translatorGroup: string | null
  status: SourceStatus
  isPreferred: boolean
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ReadingHistory {
  id: string
  workId: string
  sourceId: string | null
  eventType: HistoryEventType
  oldChapter: ChapterProgress | null
  newChapter: ChapterProgress | null
  sourceNameSnapshot: string | null
  sourceDomainSnapshot: string | null
  note: string | null
  revertsHistoryId: string | null
  occurredAt: string
  createdAt: string
}

export interface MetadataOverride {
  workId: string
  fieldKey: string
  lockedAt: string
}
