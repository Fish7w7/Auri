import type { MetadataSearchResult, MetadataWork } from '@shared/contracts'

export interface MetadataProvider {
  readonly id: string
  search(query: string, signal?: AbortSignal): Promise<MetadataSearchResult[]>
  getById(externalId: string, signal?: AbortSignal): Promise<MetadataWork | null>
}

export interface GraphqlHttpResponse {
  status: number
  headers: Record<string, string | null>
  json(): Promise<unknown>
}

export interface GraphqlTransport {
  post(url: string, body: unknown, signal?: AbortSignal): Promise<GraphqlHttpResponse>
  isOnline(): boolean
}
