import type { App } from 'electron'
import { MainProcessRuntime } from './bootstrap'
import type { MainProcessEnvironment } from './environment'

export function registerApplicationLifecycle(app: App, environment: MainProcessEnvironment): void {
  const runtime = new MainProcessRuntime(app, environment)
  const singleInstanceLock = app.requestSingleInstanceLock()

  if (!singleInstanceLock) {
    app.quit()
    return
  }

  app.on('second-instance', (_event, commandLine) => runtime.handleSecondInstance(commandLine))
  app.on('before-quit', () => runtime.dispose())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => runtime.activate())

  void app.whenReady().then(() => runtime.start())
}
