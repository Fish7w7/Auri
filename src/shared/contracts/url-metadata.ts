import type { Source, Work } from '../types/domain'

export interface UrlPageMetadata {
  requestedUrl: string
  finalUrl: string
  domain: string
  canonicalUrl: string | null
  title: string | null
  siteName: string | null
  description: string | null
  coverUrl: string | null
}

export type UrlMetadataDuplicate =
  | { kind: 'source'; work: Work; source: Source }
  | { kind: 'work'; work: Work }

export interface UrlMetadataAnalysis {
  metadata: UrlPageMetadata
  duplicate: UrlMetadataDuplicate | null
}

export interface UrlMetadataApi {
  urlMetadata: {
    analyze(request: { url: string }): Promise<UrlMetadataAnalysis>
    checkDuplicate(request: { url: string; title?: string | null }): Promise<UrlMetadataDuplicate | null>
  }
}
