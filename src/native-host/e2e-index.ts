import { DesktopConnector } from './desktop-connector'
import { NativeHostLogger } from './host-logger'
import { NativeMessagingRuntime } from './native-messaging-runtime'
import { e2eConfigPathForExecutable, loadE2EHostConfiguration } from './e2e-configuration'

// Separate entry point: it never reads APPDATA or launches an installed Desktop.
try {
  const configPath = e2eConfigPathForExecutable(process.execPath)
  const initial = loadE2EHostConfiguration(configPath)
  // Node SEA keeps the executable in argv[1]; Chromium passes the origin as argv[2].
  const validate = (): void => {
    const current = loadE2EHostConfiguration(configPath)
    if (current.userDataPath !== initial.userDataPath || current.origin !== initial.origin || process.argv[2] !== initial.origin) {
      throw new Error('AURI_NATIVE_HOST_E2E_ORIGIN_OR_PROFILE_MISMATCH')
    }
  }
  validate()
  const logger = new NativeHostLogger(initial.logPath, true, validate)
  logger.info('Native Host E2E iniciado.', { event: 'native_host.started', mode: 'e2e' })
  const connector = new DesktopConnector({
    development: true, appDataPath: '', hostExecutable: process.execPath, logger, e2eConfigPath: configPath
  })
  const runtime = new NativeMessagingRuntime(process.stdin, process.stdout, connector, logger)
  runtime.start()
  process.once('SIGTERM', () => runtime.close())
  process.once('SIGINT', () => runtime.close())
} catch {
  process.stderr.write('AURI_NATIVE_HOST_E2E_CONFIGURATION_REJECTED\n')
  process.exitCode = 1
}
