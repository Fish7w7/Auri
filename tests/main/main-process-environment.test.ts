import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  configureMainProcessEnvironment,
  resolveMainProcessEnvironment
} from '@main/application/environment'

describe('ambiente do processo principal', () => {
  it('resolve flags de runtime sem misturar bridge, smoke e release', () => {
    expect(resolveMainProcessEnvironment(['Auri.exe', '--native-bridge-start'])).toMatchObject({
      isNativeBridgeStart: true,
      isAutomatedRuntime: false
    })
    expect(resolveMainProcessEnvironment(['Auri.exe', '--release-persistence-smoke-test'])).toMatchObject({
      isReleasePersistenceSmoke: true,
      isReleaseDataSmoke: true,
      isAutomatedRuntime: true,
      isNativeBridgeStart: false
    })
  })

  it('separa Auri-Dev antes de aplicar o userData temporário dos smokes', () => {
    const paths = {
      appData: join('C:', 'Users', 'teste', 'AppData', 'Roaming'),
      temp: join('C:', 'Temp')
    }
    const setPath = vi.fn()
    const app = {
      isPackaged: false,
      setName: vi.fn(),
      setAppUserModelId: vi.fn(),
      disableHardwareAcceleration: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      getPath: vi.fn((name: keyof typeof paths) => paths[name]),
      setPath
    }

    configureMainProcessEnvironment(app as never, ['electron.exe', '--smoke-test'])

    expect(setPath.mock.calls).toEqual([
      ['userData', join(paths.appData, 'Auri-Dev')],
      ['userData', join(paths.temp, 'auri-smoke-test')]
    ])
    expect(app.disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(app.commandLine.appendSwitch).toHaveBeenCalledWith('in-process-gpu')
  })

  it('mantém o userData de produção quando não há automação', () => {
    const app = {
      isPackaged: true,
      setName: vi.fn(),
      setAppUserModelId: vi.fn(),
      disableHardwareAcceleration: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      getPath: vi.fn(),
      setPath: vi.fn()
    }

    configureMainProcessEnvironment(app as never, ['Auri.exe'])

    expect(app.setPath).not.toHaveBeenCalled()
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled()
  })
})
