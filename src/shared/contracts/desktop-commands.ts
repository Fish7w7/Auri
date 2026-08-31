import type { DesktopOpenAddWorkParams } from '@auri/protocol'

export type DesktopAddWorkDraft = DesktopOpenAddWorkParams
export type DesktopWorkChange = {
  workId: string
  kind: 'progress' | 'source'
}

export interface DesktopCommandsApi {
  desktopCommands: {
    onOpenWork(listener: (workId: string) => void): () => void
    onOpenAddWork(listener: (draft: DesktopAddWorkDraft) => void): () => void
    onWorkChanged(listener: (change: DesktopWorkChange) => void): () => void
  }
}
