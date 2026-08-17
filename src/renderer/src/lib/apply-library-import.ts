import type { ImportResult, ImportStrategy } from '@shared/contracts'

interface ApplyImportRequest {
  path: string
  strategy?: ImportStrategy
  restoreTrash?: boolean
}

export async function applyLibraryImport(
  applyImport: (request: ApplyImportRequest) => Promise<ImportResult>,
  request: ApplyImportRequest,
  refreshData: () => void
): Promise<ImportResult> {
  const result = await applyImport(request)
  refreshData()
  return result
}
