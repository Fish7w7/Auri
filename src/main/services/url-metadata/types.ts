export interface PageTransportResponse {
  statusCode: number
  headers: Record<string, string>
  body: Buffer
}

export interface PageTransport {
  isOnline?(): boolean
  request(url: string, options: { maxBytes: number; timeoutMs: number }): Promise<PageTransportResponse>
}

export interface FetchedPage {
  requestedUrl: string
  finalUrl: string
  contentType: string | null
  html: string
}

export type HostResolver = (hostname: string) => Promise<string[]>
