import { describe, expect, it, vi } from 'vitest'
import { applyLibraryImport } from '@renderer/lib/apply-library-import'

describe('applyLibraryImport', () => {
  it('invalida os dados derivados somente depois de uma importação aplicada com sucesso', async () => {
    const refreshData = vi.fn()
    const result = { created: 1, merged: 1, skipped: 0, restored: 0 }
    const applyImport = vi.fn().mockResolvedValue(result)

    await expect(applyLibraryImport(applyImport, { path: 'library.json', strategy: 'keep_current' }, refreshData)).resolves.toEqual(result)
    expect(applyImport).toHaveBeenCalledOnce()
    expect(refreshData).toHaveBeenCalledOnce()

    applyImport.mockRejectedValueOnce(new Error('import failed'))
    await expect(applyLibraryImport(applyImport, { path: 'library.json' }, refreshData)).rejects.toThrow('import failed')
    expect(refreshData).toHaveBeenCalledOnce()
  })
})
