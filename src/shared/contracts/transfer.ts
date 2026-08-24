import type { Work, Alias, Creator, Genre, Tag, Collection, Source, ReadingHistory, ExternalRef } from '@shared/types/domain'

export interface AuriExportWork {
  work: Work
  aliases: Alias[]
  creators: Creator[]
  genres: Genre[]
  tags: Tag[]
  collections: Collection[]
  sources: Source[]
  history: ReadingHistory[]
  externalRefs: ExternalRef[]
}

export interface AuriLibraryExport {
  format: 'auri-library'
  version: 1
  exportedAt: string
  works: AuriExportWork[]
}

export interface ImportCandidate {
  index: number
  title: string
  match: 'new' | 'exact' | 'probable' | 'trash'
  existingTitle: string | null
  hasConflict: boolean
}

export interface ImportPreview {
  path: string
  exportedAt: string
  total: number
  newWorks: number
  exactMatches: number
  probableMatches: number
  trashMatches: number
  conflicts: number
  candidates: ImportCandidate[]
}

export interface ImportResult {
  created: number
  merged: number
  skipped: number
  restored: number
}

export type ImportStrategy = 'keep_current' | 'use_imported'

export interface TransferApi {
  transfer: {
    exportJson(): Promise<{ path: string } | null>
    exportCsv(): Promise<{ path: string } | null>
    chooseImport(): Promise<ImportPreview | null>
    applyImport(request: { path: string; strategy?: ImportStrategy; restoreTrash?: boolean }): Promise<ImportResult>
  }
}
