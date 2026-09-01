import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const BRIDGE_SECRET_BYTES = 32

export function resolveBridgeUserData(appDataPath: string, development: boolean): string {
  return join(appDataPath, development ? 'Auri-Dev' : 'Auri')
}

export function resolveBridgeSecretPath(userDataPath: string): string {
  return join(userDataPath, 'native-bridge', 'secret')
}

export function resolveBridgeEndpoint(userDataPath: string, development: boolean, userHome = homedir()): string {
  return resolveBridgeEndpointForProfile(userDataPath, development ? 'auri-desktop-dev' : 'auri-desktop', userHome)
}

export function resolveBridgeEndpointForProfile(userDataPath: string, pipePrefix: string, userHome = homedir()): string {
  const scope = createHash('sha256').update(`${userHome}\0${userDataPath}`).digest('hex').slice(0, 20)
  return `\\\\.\\pipe\\${pipePrefix}-v1-${scope}`
}
