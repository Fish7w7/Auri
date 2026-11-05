import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { validateE2EUserDataPath } from '../main/app/e2e-user-data'
import { resolveBridgeEndpointForProfile, resolveBridgeSecretPath } from '@shared/native-bridge/identity'

export const E2E_NATIVE_HOST_NAME = 'app.auri.native_host.e2e'
export const E2E_NATIVE_HOST_EXECUTABLE = 'AuriNativeHostE2E.exe'
export const E2E_NATIVE_HOST_CONFIG = 'e2e-config.json'
// An unpackaged Desktop uses this prefix; the canonical profile hash isolates it from ordinary DEV.
export const E2E_PIPE_PREFIX = 'auri-desktop-dev'
const RESERVED_EXTENSION_IDS = [
  'agefiaohfielfgadiagemnflekbboblp', 'alnngjgmhiebpnjefjmhbhmhfpgoibnh',
  'lfneneebngmiikddoddnlcgobfjkodpm'
]

export interface E2EHostConfiguration {
  version: 1
  projectRoot: string
  userDataPath: string
  extensionId: string
}
export interface E2EHostPaths extends E2EHostConfiguration {
  configPath: string
  endpoint: string
  secretPath: string
  logPath: string
  origin: string
}

function invalid(): never { throw new Error('AURI_NATIVE_HOST_E2E_CONFIG_INVALID') }

/** Reject links (including junctions), hard links and missing/non-regular files before reading. */
export function assertE2EPrivateFile(filePath: string): void {
  if (!isAbsolute(filePath)) invalid()
  const absolute = resolve(filePath)
  let current = parse(absolute).root
  const segments = absolute.slice(current.length).split(sep).filter(Boolean)
  for (let index = 0; index < segments.length; index++) {
    current = join(current, segments[index])
    const entry = lstatSync(current, { throwIfNoEntry: false })
    if (!entry || entry.isSymbolicLink()) invalid()
    if (index < segments.length - 1 ? !entry.isDirectory() : !entry.isFile() || entry.nlink !== 1) invalid()
  }
  if (relative(absolute, realpathSync.native(absolute)) !== '') invalid()
}

export function loadE2EHostConfiguration(configPath: string): E2EHostPaths {
  try {
    assertE2EPrivateFile(configPath)
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as E2EHostConfiguration
    if (!config || Object.keys(config).sort().join(',') !== 'extensionId,projectRoot,userDataPath,version') invalid()
    if (config.version !== 1 || typeof config.projectRoot !== 'string' || typeof config.userDataPath !== 'string' ||
        typeof config.extensionId !== 'string' || !/^[a-p]{32}$/u.test(config.extensionId) ||
        RESERVED_EXTENSION_IDS.includes(config.extensionId)) invalid()
    if (!isAbsolute(config.projectRoot) || config.projectRoot !== resolve(config.projectRoot)) invalid()
    const expectedConfig = join(config.projectRoot, 'artifacts', 'native-host', 'e2e', E2E_NATIVE_HOST_CONFIG)
    if (relative(expectedConfig, resolve(configPath)) !== '') invalid()
    const userDataPath = validateE2EUserDataPath(config.projectRoot, config.userDataPath)
    const expectedProfile = join(realpathSync.native(config.projectRoot), 'artifacts', 'e2e-profiles', 'auritest-01')
    if (relative(expectedProfile, userDataPath) !== '' || !lstatSync(userDataPath).isDirectory()) invalid()
    return {
      ...config, userDataPath, configPath: resolve(configPath),
      endpoint: resolveBridgeEndpointForProfile(userDataPath, E2E_PIPE_PREFIX),
      secretPath: resolveBridgeSecretPath(userDataPath),
      logPath: join(userDataPath, 'logs', 'native-host-e2e.log'),
      origin: 'chrome-extension://' + config.extensionId + '/'
    }
  } catch { invalid() }
}

export function e2eConfigPathForExecutable(executable: string): string {
  return join(dirname(resolve(executable)), E2E_NATIVE_HOST_CONFIG)
}
