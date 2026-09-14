import type { App } from 'electron'
import type { AppContext } from '../app/create-app-context'
import { createAppContext } from '../app/create-app-context'
import { shouldRestoreWindowForSecondInstance } from '../app/native-bridge-startup'
import { registerIpcHandlers } from '../ipc/register-ipc-handlers'
import type { NamedPipeBridgeServer } from '../bridge/named-pipe-server'
import { startDesktopBridge } from '../bridge/desktop-bridge'
import { DesktopCommandService } from '../services/desktop-command-service'
import { MainWindowController } from '../windows/main-window-controller'
import type { MainProcessEnvironment } from './environment'
import { startApplicationBackgroundTasks } from './background-tasks'
import { showStartupRecovery } from './startup-recovery'

type SmokeRuntime = typeof import('../smoke/smoke-runtime')

export class MainProcessRuntime {
  private context: AppContext | null = null
  private windowController: MainWindowController | null = null
  private bridge: NamedPipeBridgeServer | null = null
  private unregisterIpc: (() => void) | null = null
  private smoke: SmokeRuntime | null = null
  private disposed = false

  constructor(
    private readonly app: App,
    private readonly environment: MainProcessEnvironment
  ) {}

  async start(): Promise<void> {
    try {
      this.smoke = this.environment.isAutomatedRuntime ? await import('../smoke/smoke-runtime') : null
      this.context = await createAppContext(
        this.app,
        this.smoke?.createSmokeAppContextOptions(this.environment) ?? {}
      )
      this.smoke?.emitInitialSmokeUpdate(this.environment)

      if (this.smoke && await this.smoke.runHeadlessSmoke(this.app, this.context, this.environment)) return

      this.unregisterIpc = registerIpcHandlers(
        this.context.services,
        this.context.logger,
        this.smoke?.createSmokeIpcOptions(this.app, this.context, this.environment)
      )
      startApplicationBackgroundTasks(this.context, this.environment)
      this.smoke?.prepareScreenshotFixture(this.context, this.environment)

      this.windowController = new MainWindowController(this.app, this.context)
      const mainWindow = this.windowController.create({
        showWhenReady: !this.environment.isApplicationSmoke && !this.environment.isSettingsScrollSmoke && !this.environment.isNativeBridgeStart,
        keepRenderingWhenHidden: this.environment.isApplicationSmoke || this.environment.isScreenshotSmoke || this.environment.isSettingsScrollSmoke
      })

      if (!this.environment.isAutomatedRuntime) {
        const desktop = new DesktopCommandService(
          () => this.windowController?.getWindow() ?? null,
          { focusApplication: () => this.app.focus() }
        )
        this.bridge = await startDesktopBridge({
          appVersion: this.app.getVersion(),
          userDataPath: this.app.getPath('userData'),
          isPackaged: this.app.isPackaged,
          context: this.context,
          desktop
        })
      }

      this.smoke?.registerSmokeRunners(mainWindow, this.environment)
    } catch (error) {
      await showStartupRecovery(error)
    }
  }

  activate(): void {
    if (!this.context || this.disposed) return
    if (!this.windowController) this.windowController = new MainWindowController(this.app, this.context)
    this.windowController.createIfMissing()
  }

  handleSecondInstance(commandLine: readonly string[]): void {
    if (!shouldRestoreWindowForSecondInstance(commandLine)) return
    this.windowController?.activateExisting()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.bridge?.close()
    this.windowController?.beginQuit()
    this.unregisterIpc?.()
    this.context?.dispose()
    this.windowController?.dispose()
    this.bridge = null
    this.unregisterIpc = null
    this.context = null
    this.windowController = null
    this.smoke = null
  }
}
