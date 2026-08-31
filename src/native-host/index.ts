import { join } from 'node:path'
import { resolveBridgeUserData } from '@shared/native-bridge/identity'
import { DesktopConnector } from './desktop-connector'
import { NativeHostLogger } from './host-logger'
import { NativeMessagingRuntime } from './native-messaging-runtime'

const development = process.env.AURI_NATIVE_HOST_MODE === 'dev'
const appDataPath = process.env.APPDATA

if (!appDataPath) {
  process.stderr.write('AURI_NATIVE_HOST_APPDATA_MISSING\n')
  process.exitCode = 1
} else {
  const userDataPath = resolveBridgeUserData(appDataPath, development)
  const logger = new NativeHostLogger(join(userDataPath, 'logs', 'native-host.log'), development)
  const connector = new DesktopConnector({
    development, appDataPath, hostExecutable: process.execPath, logger
  })
  const runtime = new NativeMessagingRuntime(process.stdin, process.stdout, connector, logger)
  runtime.start()
  process.once('SIGTERM', () => runtime.close())
  process.once('SIGINT', () => runtime.close())
}

