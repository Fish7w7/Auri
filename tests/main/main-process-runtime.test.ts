import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainProcessEnvironment } from '@main/application/environment'

const dependencies = vi.hoisted(() => ({
  context: {
    services: {
      backups: { runAutomaticIfDue: vi.fn(async () => undefined) },
      updates: { isDevelopmentMock: true }
    },
    logger: { error: vi.fn() },
    dispose: vi.fn()
  },
  unregisterIpc: vi.fn(),
  bridge: { close: vi.fn() },
  window: { id: 1 },
  windowController: {
    create: vi.fn(), getWindow: vi.fn(), activateExisting: vi.fn(),
    createIfMissing: vi.fn(), beginQuit: vi.fn(), dispose: vi.fn()
  },
  showStartupRecovery: vi.fn(),
  assertE2EUserData: vi.fn()
}))

vi.mock('@main/app/e2e-user-data', () => ({ assertE2EUserData: dependencies.assertE2EUserData }))
vi.mock('@main/app/create-app-context', () => ({ createAppContext: vi.fn(async () => dependencies.context) }))
vi.mock('@main/ipc/register-ipc-handlers', () => ({ registerIpcHandlers: vi.fn(() => dependencies.unregisterIpc) }))
vi.mock('@main/bridge/desktop-bridge', () => ({ startDesktopBridge: vi.fn(async () => dependencies.bridge) }))
vi.mock('@main/services/desktop-command-service', () => ({ DesktopCommandService: class {} }))
vi.mock('@main/windows/main-window-controller', () => ({
  MainWindowController: class {
    create = dependencies.windowController.create
    getWindow = dependencies.windowController.getWindow
    activateExisting = dependencies.windowController.activateExisting
    createIfMissing = dependencies.windowController.createIfMissing
    beginQuit = dependencies.windowController.beginQuit
    dispose = dependencies.windowController.dispose
  }
}))
vi.mock('@main/application/startup-recovery', () => ({ showStartupRecovery: dependencies.showStartupRecovery }))

import { startDesktopBridge } from '@main/bridge/desktop-bridge'
import { createAppContext } from '@main/app/create-app-context'
import { registerIpcHandlers } from '@main/ipc/register-ipc-handlers'
import { MainProcessRuntime } from '@main/application/bootstrap'

const environment = {
  isApplicationSmoke: false,
  isScreenshotSmoke: false,
  isSettingsScrollSmoke: false,
  isBackupSmoke: false,
  isReleasePersistenceSmoke: false,
  isReleaseBackupRestoreSmoke: false,
  isReleaseDataSmoke: false,
  isAutomatedRuntime: false,
  isNativeBridgeStart: false
} satisfies MainProcessEnvironment

beforeEach(() => {
  vi.clearAllMocks()
  dependencies.windowController.create.mockReturnValue(dependencies.window)
  dependencies.windowController.getWindow.mockReturnValue(dependencies.window)
  dependencies.assertE2EUserData.mockReset()
})

describe('runtime do processo principal', () => {
  it('compõe contexto, IPC, janela e bridge uma única vez', async () => {
    const app = createApp()
    const runtime = new MainProcessRuntime(app as never, environment)

    await runtime.start()

    expect(createAppContext).toHaveBeenCalledOnce()
    expect(registerIpcHandlers).toHaveBeenCalledOnce()
    expect(dependencies.windowController.create).toHaveBeenCalledOnce()
    expect(startDesktopBridge).toHaveBeenCalledOnce()
  })

  it('valida o perfil E2E antes dos serviços e não usa recovery se a guarda falha', async () => {
    const app = createApp()
    const failure = new Error('perfil E2E mudou')
    dependencies.assertE2EUserData.mockImplementation(() => { throw failure })
    const runtime = new MainProcessRuntime(app as never, { ...environment, e2eUserDataPath: 'perfil-sintetico' })
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await expect(runtime.start()).rejects.toThrow(failure)
      expect(createAppContext).not.toHaveBeenCalled()
      expect(registerIpcHandlers).not.toHaveBeenCalled()
      expect(startDesktopBridge).not.toHaveBeenCalled()
      expect(dependencies.showStartupRecovery).not.toHaveBeenCalled()
      expect(app.exit).toHaveBeenCalledWith(1)
    } finally { stderr.mockRestore() }
  })

  it('preserva a intenção da segunda instância e limpa recursos uma vez', async () => {
    const runtime = new MainProcessRuntime(createApp() as never, environment)
    await runtime.start()

    runtime.handleSecondInstance(['Auri.exe', '--native-bridge-start'])
    expect(dependencies.windowController.activateExisting).not.toHaveBeenCalled()
    runtime.handleSecondInstance(['Auri.exe'])
    expect(dependencies.windowController.activateExisting).toHaveBeenCalledOnce()

    runtime.dispose()
    runtime.dispose()
    expect(dependencies.bridge.close).toHaveBeenCalledOnce()
    expect(dependencies.windowController.beginQuit).toHaveBeenCalledOnce()
    expect(dependencies.unregisterIpc).toHaveBeenCalledOnce()
    expect(dependencies.context.dispose).toHaveBeenCalledOnce()
    expect(dependencies.windowController.dispose).toHaveBeenCalledOnce()
  })
})

function createApp() {
  return {
    getVersion: () => '1.13.0',
    getPath: () => 'C:\\Auri',
    isPackaged: false,
    focus: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn()
  }
}
