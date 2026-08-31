import type { DesktopOpenAddWorkParams } from '@auri/protocol'

export type DesktopAddWorkDraft = DesktopOpenAddWorkParams

export interface DesktopCommandsApi {
  desktopCommands: {
    onOpenWork(listener: (workId: string) => void): () => void
    onOpenAddWork(listener: (draft: DesktopAddWorkDraft) => void): () => void
  }
}
