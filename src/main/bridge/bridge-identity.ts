import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { BRIDGE_SECRET_BYTES, resolveBridgeEndpoint as resolveSharedBridgeEndpoint, resolveBridgeSecretPath } from '@shared/native-bridge/identity'
export { BRIDGE_SECRET_BYTES } from '@shared/native-bridge/identity'

export interface BridgeIdentity { endpoint: string; secret: Buffer; secretPath: string }

export function resolveBridgeEndpoint(userDataPath: string, isPackaged: boolean, userHome?: string): string {
  return resolveSharedBridgeEndpoint(userDataPath, !isPackaged, userHome)
}

export function loadOrCreateBridgeIdentity(userDataPath: string, isPackaged: boolean): BridgeIdentity {
  const secretPath = resolveBridgeSecretPath(userDataPath)
  const directory = dirname(secretPath)
  mkdirSync(directory, { recursive: true })
  let secret: Buffer
  try { secret = Buffer.from(readFileSync(secretPath, 'utf8').trim(), 'base64') }
  catch {
    secret = randomBytes(BRIDGE_SECRET_BYTES)
    try { writeFileSync(secretPath, secret.toString('base64'), { encoding: 'utf8', flag: 'wx', mode: 0o600 }) }
    catch { secret = Buffer.from(readFileSync(secretPath, 'utf8').trim(), 'base64') }
  }
  if (secret.length !== BRIDGE_SECRET_BYTES) throw new Error('O secret local do bridge é inválido.')
  try { chmodSync(secretPath, 0o600) } catch { /* ACL POSIX não é garantida no Windows */ }
  return { endpoint: resolveBridgeEndpoint(userDataPath, isPackaged), secret, secretPath }
}
