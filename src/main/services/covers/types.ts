export interface CoverDownloadClient {
  isOnline(): boolean
  download(url: string, options: { maxBytes: number; timeoutMs: number; maxRedirects: number }): Promise<Buffer>
}

export interface PreparedCover { workId: string; sourceUrl: string; temporaryPath: string }
