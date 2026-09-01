import { join } from 'node:path'
import { DesktopConnector } from './desktop-connector'
import { NativeHostLogger } from './host-logger'
import { NativeMessagingRuntime } from './native-messaging-runtime'
import { isDevelopmentNativeHost, NATIVE_HOST_BUILD_MODE, NATIVE_HOST_USER_DATA_DIRECTORY } from './build-mode'

const development = isDevelopmentNativeHost(NATIVE_HOST_BUILD_MODE)
const appDataPath = process.env.APPDATA

if (!appDataPath) {
  process.stderr.write('AURI_NATIVE_HOST_APPDATA_MISSING\n')
  process.exitCode = 1
} else {
  const userDataPath = join(appDataPath, NATIVE_HOST_USER_DATA_DIRECTORY)
  const logger = new NativeHostLogger(join(userDataPath, 'logs', 'native-host.log'), development)
  logger.info('Native Host iniciado.', { event: 'native_host.started', mode: NATIVE_HOST_BUILD_MODE })
  const connector = new DesktopConnector({
    development, appDataPath, hostExecutable: process.execPath, logger
  })
  const runtime = new NativeMessagingRuntime(process.stdin, process.stdout, connector, logger)
  runtime.start()
  process.once('SIGTERM', () => { logger.info('Native Host encerrado.', { event: 'native_host.stopped' }); runtime.close() })
  process.once('SIGINT', () => { logger.info('Native Host encerrado.', { event: 'native_host.stopped' }); runtime.close() })
}
