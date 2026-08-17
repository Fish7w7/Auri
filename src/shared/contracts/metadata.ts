import type { MediaType, PublicationStatus, Work, ExternalRef } from '../types/domain'
import type { WorkDetails } from './domain'

export interface MetadataAlias { name: string; kind: 'english' | 'romaji' | 'native' | 'synonym' }
export interface MetadataCreator { name: string; role: 'author' | 'artist' | 'story' | 'original_creator' | 'other' }
export interface MetadataWork {
  provider: string
  externalId: string
  title: string
  originalTitle: string | null
  aliases: MetadataAlias[]
  description: string | null
  mediaType: MediaType | null
  publicationStatus: PublicationStatus | null
  countryCode: string | null
  startDate: string | null
  endDate: string | null
  creators: MetadataCreator[]
  genres: string[]
  coverUrl: string | null
  canonicalUrl: string | null
}

export type MetadataSearchResult = Pick<MetadataWork, 'provider' | 'externalId' | 'title' | 'originalTitle' | 'mediaType' | 'publicationStatus' | 'countryCode' | 'startDate' | 'coverUrl' | 'canonicalUrl'>
export interface MetadataDuplicate { kind: 'active' | 'trash' | 'probable'; work: Work }
export interface MetadataReview { metadata: MetadataWork; duplicate: MetadataDuplicate | null }
export interface ImportMetadataRequest {
  provider: string
  externalId: string
  title: string
  mediaType: MediaType
  userStatus: import('../types/domain').UserStatus
  chapter?: string | null
  lastReadNote?: string | null
  allowProbableDuplicate?: boolean
  source?: { name?: string | null; seriesUrl?: string | null; lastReadUrl?: string | null; language?: string | null; translatorGroup?: string | null; isPreferred?: boolean }
}
export type MetadataFieldKey = 'title' | 'description' | 'media_type' | 'publication_status' | 'country_code' | 'start_date' | 'end_date' | 'aliases' | 'creators' | 'genres' | 'cover'
export interface MetadataRefreshChange { field: MetadataFieldKey; label: string; current: string | null; incoming: string | null; protected: boolean }
export interface MetadataRefreshPreview { workId: string; provider: string; externalId: string; changes: MetadataRefreshChange[]; externalRef: ExternalRef }
export interface MetadataApplyResult { details: WorkDetails; warnings: string[] }

export interface MetadataApi {
  metadata: {
    search(request: { provider?: string; query: string }): Promise<MetadataSearchResult[]>
    review(request: { provider: string; externalId: string }): Promise<MetadataReview>
    import(request: ImportMetadataRequest): Promise<WorkDetails>
    previewRefresh(request: { workId: string }): Promise<MetadataRefreshPreview>
    applyRefresh(request: { workId: string }): Promise<MetadataApplyResult>
  }
}
