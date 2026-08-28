export type UpdateStatus = 'unavailable' | 'idle' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  progressPercent: number | null
  releaseNotes: string | null
  errorMessage: string | null
  lastCheckedAt: string | null
  availability: 'ready' | 'development' | 'not_configured'
}

export interface UpdatesApi {
  updates: {
    state(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    install(): Promise<void>
    setDirty(request: { scope: string; dirty: boolean }): Promise<void>
  }
}
