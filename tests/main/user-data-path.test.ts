import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { resolveApplicationUserDataPath, separateDevelopmentUserData } from '@main/app/user-data-path'

describe('userData por ambiente', () => {
  it('mantém produção em Auri e separa desenvolvimento em Auri-Dev', () => {
    const appData = join('C:', 'Users', 'teste', 'AppData', 'Roaming')
    expect(resolveApplicationUserDataPath(appData, true)).toBe(join(appData, 'Auri'))
    expect(resolveApplicationUserDataPath(appData, false)).toBe(join(appData, 'Auri-Dev'))
  })

  it('redireciona somente desenvolvimento antes do bootstrap', () => {
    const appData = join('C:', 'Users', 'teste', 'AppData', 'Roaming')
    const development = { isPackaged: false, getPath: vi.fn(() => appData), setPath: vi.fn() }
    separateDevelopmentUserData(development as never)
    expect(development.setPath).toHaveBeenCalledWith('userData', join(appData, 'Auri-Dev'))

    const packaged = { isPackaged: true, getPath: vi.fn(() => appData), setPath: vi.fn() }
    separateDevelopmentUserData(packaged as never)
    expect(packaged.getPath).not.toHaveBeenCalled()
    expect(packaged.setPath).not.toHaveBeenCalled()
  })
})
