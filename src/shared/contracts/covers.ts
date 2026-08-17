export interface CoverResult { state: 'placeholder' | 'ready' | 'error'; dataUrl: string | null; source: 'none' | 'custom' | 'cache'; cached: boolean }
export interface CoverCacheUsage { files: number; bytes: number; queue: number; active: number }
export interface CoverApi {
  covers: {
    get(request: { workId: string }): Promise<CoverResult>
    refresh(request: { workId: string }): Promise<CoverResult>
    clearWork(request: { workId: string }): Promise<void>
    clearAll(): Promise<CoverCacheUsage>
    usage(): Promise<CoverCacheUsage>
  }
}
