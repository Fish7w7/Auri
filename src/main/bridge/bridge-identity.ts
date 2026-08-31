import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const BRIDGE_SECRET_BYTES = 32

export interface BridgeIdentity { endpoint: string; secret: Buffer; secretPath: string }

export function resolveBridgeEndpoint(userDataPath: string, isPackaged: boolean, userHome = homedir()): string {
  const scope = createHash('sha256').update(`${userHome}\0${userDataPath}`).digest('hex').slice(0, 20)
  return `\\\\.\\pipe\\${isPackaged ? 'auri-desktop' : 'auri-desktop-dev'}-v1-${scope}`
}

export function loadOrCreateBridgeIdentity(userDataPath: string, isPackaged: boolean): BridgeIdentity {
  const directory = join(userDataPath, 'native-bridge')
  const secretPath = join(directory, 'secret')
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
