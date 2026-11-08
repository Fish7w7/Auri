import type { App } from 'electron'
import { join } from 'node:path'
import type { AppContext } from '../app/create-app-context'
import { createAppContext } from '../app/create-app-context'
import { shouldRestoreWindowForSecondInstance } from '../app/native-bridge-startup'
import { registerIpcHandlers } from '../ipc/register-ipc-handlers'
import type { NamedPipeBridgeServer } from '../bridge/named-pipe-server'
import { startDesktopBridge } from '../bridge/desktop-bridge'
import { DesktopCommandService } from '../services/desktop-command-service'
import { readStoredSettings } from '../services/settings-service'
import { MainWindowController } from '../windows/main-window-controller'
import type { MainProcessEnvironment } from './environment'
import { startApplicationBackgroundTasks } from './background-tasks'
import { showStartupRecovery } from './startup-recovery'
import { assertE2EUserData } from '../app/e2e-user-data'

type SmokeRuntime = typeof import('../smoke/smoke-runtime')

export class MainProcessRuntime {
  private context: AppContext | null = null
  private windowController: MainWindowController | null = null
  private bridge: NamedPipeBridgeServer | null = null
  private unregisterIpc: (() => void) | null = null
  private smoke: SmokeRuntime | null = null
  private disposed = false
  private startupFailed = false
  private resolveServices!: (ready: boolean) => void
  private readonly servicesReady = new Promise<boolean>((resolve) => { this.resolveServices = resolve })

  constructor(
    private readonly app: App,
    private readonly environment: MainProcessEnvironment
  ) {}

  async start(): Promise<void> {
    if (this.disposed) return
    try {
      if (this.environment.e2eUserDataPath) assertE2EUserData(this.app, this.environment.e2eUserDataPath)
      const foreground = !this.environment.isAutomatedRuntime && !this.environment.isNativeBridgeStart
      if (foreground) {
        this.windowController = new MainWindowController(this.app)
        this.windowController.create({
          showWhenReady: () => !this.disposed && !this.startupFailed,
          cinematicIntro: this.isCinematicIntroEnabled(),
          servicesReady: this.servicesReady
        })
      }
      this.smoke = this.environment.isAutomatedRuntime ? await import('../smoke/smoke-runtime') : null
      if (this.disposed) return
      const context = await createAppContext(
        this.app,
        this.smoke?.createSmokeAppContextOptions(this.environment) ?? {}
      )
      if (this.disposed) {
        context.dispose()
        return
      }
      this.context = context
      this.smoke?.emitInitialSmokeUpdate(this.environment)

      if (this.smoke && await this.smoke.runHeadlessSmoke(this.app, this.context, this.environment)) return

      this.unregisterIpc = registerIpcHandlers(
        this.context.services,
        this.context.logger,
        this.smoke?.createSmokeIpcOptions(this.app, this.context, this.environment)
      )
      startApplicationBackgroundTasks(this.context, this.environment)
      this.smoke?.prepareScreenshotFixture(this.context, this.environment)

      this.windowController ??= new MainWindowController(this.app)
      this.windowController.attachSettings(context.services.settings)
      const mainWindow = this.windowController.getWindow() ?? this.windowController.create({
        showWhenReady: !this.environment.isApplicationSmoke && !this.environment.isSettingsScrollSmoke && !this.environment.isNativeBridgeStart,
        keepRenderingWhenHidden: this.environment.isApplicationSmoke || this.environment.isScreenshotSmoke || this.environment.isSettingsScrollSmoke
      })
      this.resolveServices(true)

      if (!this.environment.isAutomatedRuntime) {
        const desktop = new DesktopCommandService(
          () => this.windowController?.getWindow() ?? null,
          { focusApplication: () => this.app.focus() }
        )
        const bridge = await startDesktopBridge({
          appVersion: this.app.getVersion(),
          userDataPath: this.app.getPath('userData'),
          isPackaged: this.app.isPackaged,
          context: this.context,
          desktop
        })
        if (this.disposed) {
          bridge.close()
          return
        }
        this.bridge = bridge
      }

      this.smoke?.registerSmokeRunners(mainWindow, this.environment)
    } catch (error) {
      if (this.disposed) return
      this.startupFailed = true
      this.resolveServices(false)
      this.windowController?.getWindow()?.hide()
      if (this.environment.e2eUserDataPath) {
        this.dispose()
        console.error('[auri:e2e] Inicialização interrompida; sem fallback ou recuperação automática.', error)
        this.app.exit(1)
        throw error
      }
      await showStartupRecovery(error)
    }
  }

  activate(): void {
    if (this.disposed || this.startupFailed) return
    if (this.context) this.windowController?.createIfMissing()
    else this.windowController?.activateExisting()
  }

  handleSecondInstance(commandLine: readonly string[]): void {
    if (this.startupFailed || !shouldRestoreWindowForSecondInstance(commandLine)) return
    this.windowController?.activateExisting()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resolveServices(false)
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

  private isCinematicIntroEnabled(): boolean {
    try {
      return readStoredSettings(join(this.app.getPath('userData'), 'settings.json')).cinematicIntro
    } catch {
      return true
    }
  }
}
