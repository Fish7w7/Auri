import type { AppContext } from '../app/create-app-context'
import { DesktopCommandService } from '../services/desktop-command-service'
import { createProtocolHandlers } from '../protocol/protocol-handlers'
import { DESKTOP_PROTOCOL_FEATURES, ProtocolDispatcher } from '../protocol/protocol-dispatcher'
import { loadOrCreateBridgeIdentity } from './bridge-identity'
import { NamedPipeBridgeServer } from './named-pipe-server'

export interface DesktopBridgeOptions {
  appVersion: string
  userDataPath: string
  isPackaged: boolean
  context: AppContext
  desktop: DesktopCommandService
}

export async function startDesktopBridge(options: DesktopBridgeOptions): Promise<NamedPipeBridgeServer> {
  let dispatcher!: ProtocolDispatcher
  const handlers = createProtocolHandlers({
    appVersion: options.appVersion,
    resolution: options.context.services.resolution,
    workContext: options.context.services.workContext,
    works: options.context.services.works,
    sources: options.context.services.sources,
    progress: options.context.services.progress,
    desktop: options.desktop
  }, () => dispatcher.capabilities)
  dispatcher = new ProtocolDispatcher(handlers, options.context.logger, DESKTOP_PROTOCOL_FEATURES)
  const identity = loadOrCreateBridgeIdentity(options.userDataPath, options.isPackaged)
  const server = new NamedPipeBridgeServer(identity.endpoint, identity.secret, dispatcher, options.context.logger)
  await server.start()
  return server
}
