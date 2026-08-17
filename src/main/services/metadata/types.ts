import type { MetadataSearchResult, MetadataWork } from '@shared/contracts'

export interface MetadataProvider {
  readonly id: string
  search(query: string): Promise<MetadataSearchResult[]>
  getById(externalId: string): Promise<MetadataWork | null>
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
