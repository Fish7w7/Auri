import { createHash, createPublicKey } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path'
import { validateE2EUserDataPath } from '../main/app/e2e-user-data'
import { assertE2EPrivateFile, E2E_NATIVE_HOST_CONFIG, E2E_NATIVE_HOST_EXECUTABLE, E2E_NATIVE_HOST_NAME, loadE2EHostConfiguration, type E2EHostPaths } from './e2e-configuration'

export const E2E_BRAVE_REGISTRY_KEY = 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\' + E2E_NATIVE_HOST_NAME
export interface RegistrySnapshot { defaultValue: string; valueNames: string[]; subkeys: string[] }
export interface E2ERegistrationOwnership {
  version: 1; key: string; manifestPath: string; manifestSha256: string; previouslyAbsent: true
}
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }

function manifestPathChecked(manifestPath: string): string {
  requireCondition(isAbsolute(manifestPath) && basename(manifestPath) === E2E_NATIVE_HOST_NAME + '.json' &&
    basename(dirname(manifestPath)) === 'e2e', 'Manifest exclusivo E2E obrigatório.')
  return resolve(manifestPath)
}

/** Pure plans only. This module has no registry adapter or registry execution. */
export function planE2ERegistration(manifestPath: string, current: RegistrySnapshot | null) {
  requireCondition(current === null, 'Chave E2E existente: interromper; nunca sobrescrever, mesmo com o mesmo caminho.')
  return { operation: 'create-new-key', key: E2E_BRAVE_REGISTRY_KEY, defaultValue: manifestPathChecked(manifestPath) } as const
}
export function planE2ERemoval(manifestPath: string, manifestSha256: string, current: RegistrySnapshot | null, ownership?: E2ERegistrationOwnership) {
  const selected = manifestPathChecked(manifestPath)
  requireCondition(ownership?.version === 1 && ownership.previouslyAbsent === true && ownership.key === E2E_BRAVE_REGISTRY_KEY &&
    ownership.manifestPath === selected && ownership.manifestSha256 === manifestSha256 && /^[a-f0-9]{64}$/u.test(manifestSha256),
  'Remoção exige comprovante de propriedade criado após registro e read-back.')
  requireCondition(current?.defaultValue === selected && current.valueNames.length === 1 && current.valueNames[0] === '' && current.subkeys.length === 0,
    'Chave ausente, alterada ou com outros valores/subchaves: não excluir.')
  return { operation: 'delete-owned-key', key: E2E_BRAVE_REGISTRY_KEY } as const
}

export function createE2EHostManifest(paths: E2EHostPaths) {
  const validated = loadE2EHostConfiguration(paths.configPath)
  requireCondition(validated.origin === paths.origin && validated.userDataPath === paths.userDataPath, 'Origin ou perfil não corresponde à configuração validada.')
  return {
    name: E2E_NATIVE_HOST_NAME, description: 'Auri Native Host E2E (isolated)',
    path: join(dirname(paths.configPath), E2E_NATIVE_HOST_EXECUTABLE), type: 'stdio',
    allowed_origins: [paths.origin]
  } as const
}

function assertDirectoryAncestors(directory: string): void {
  const absolute = resolve(directory)
  let current = parse(absolute).root
  for (const segment of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, segment)
    const entry = lstatSync(current, { throwIfNoEntry: false })
    if (!entry) return
    requireCondition(!entry.isSymbolicLink() && entry.isDirectory(), 'Link ou arquivo no diretório E2E.')
  }
}
function listJavaScript(directory: string): string[] {
  assertDirectoryAncestors(directory)
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    requireCondition(!entry.isSymbolicLink(), 'Link no build E2E.')
    if (entry.isDirectory()) return listJavaScript(path)
    assertE2EPrivateFile(path)
    return path.endsWith('.js') ? [readFileSync(path, 'utf8')] : []
  })
}

export function prepareE2EIntegration(projectRoot: string, extensionRoot: string) {
  requireCondition(isAbsolute(projectRoot) && isAbsolute(extensionRoot), 'Raízes absolutas explícitas obrigatórias.')
  projectRoot = resolve(projectRoot)
  const profile = validateE2EUserDataPath(projectRoot, join(projectRoot, 'artifacts', 'e2e-profiles', 'auritest-01'))
  requireCondition(lstatSync(profile).isDirectory(), 'O perfil auritest-01 precisa existir.')
  const secretPath = join(profile, 'native-bridge', 'secret')
  assertE2EPrivateFile(secretPath)
  requireCondition(Buffer.from(readFileSync(secretPath, 'utf8').trim(), 'base64').length === 32, 'Secret E2E ausente ou inválido.')
  const directory = join(projectRoot, 'artifacts', 'native-host', 'e2e')
  assertDirectoryAncestors(directory)
  assertE2EPrivateFile(join(directory, E2E_NATIVE_HOST_EXECUTABLE))
  const extensionDirectory = join(resolve(extensionRoot), 'artifacts', 'e2e-native')
  const extensionManifestPath = join(extensionDirectory, 'manifest.json')
  const publicIdentityPath = join(extensionRoot, 'config', 'e2e-extension.json')
  assertE2EPrivateFile(extensionManifestPath)
  assertE2EPrivateFile(publicIdentityPath)
  const packagePath = join(extensionRoot, "package.json")
  const sourceManifestPath = join(extensionRoot, "public", "manifest.json")
  assertE2EPrivateFile(packagePath)
  assertE2EPrivateFile(sourceManifestPath)
  const metadata = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: unknown; version?: unknown }
  const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8")) as { version?: unknown }
  const version = metadata.version
  requireCondition(metadata.name === "auri-extension" && typeof version === "string" &&
    /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/u.test(version) &&
    version.split(".").every((part) => Number(part) <= 65535) && version.split(".").some((part) => Number(part) > 0) &&
    sourceManifest.version === version, "Versão declarada da Extension inválida ou divergente do manifest fonte.")
  const extensionManifest = JSON.parse(readFileSync(extensionManifestPath, 'utf8')) as Record<string, unknown>
  const identity = JSON.parse(readFileSync(publicIdentityPath, 'utf8')) as { publicKey: string }
  requireCondition(Object.keys(identity).join(',') === 'publicKey' && typeof identity.publicKey === 'string', 'Somente chave pública E2E permitida.')
  const key = Buffer.from(identity.publicKey, 'base64')
  requireCondition(key.toString('base64') === identity.publicKey && createPublicKey({ key, format: 'der', type: 'spki' }).asymmetricKeyType === 'rsa', 'Chave pública RSA inválida.')
  const extensionId = createHash('sha256').update(key).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
  requireCondition(extensionManifest.key === identity.publicKey && extensionManifest.manifest_version === 3 &&
    extensionManifest.name === 'Auri Extension E2E' && extensionManifest.version === version &&
    extensionManifest.version_name === version + ' E2E' &&
    JSON.stringify(extensionManifest.permissions) === JSON.stringify(['activeTab', 'scripting', 'nativeMessaging']), 'Manifest da Extension não corresponde à variante E2E.')
  const scripts = listJavaScript(extensionDirectory).join('\n')
  requireCondition(scripts.includes(E2E_NATIVE_HOST_NAME) && !/["']app\.auri\.native_host(?:\.dev)?["']/u.test(scripts), 'Host PROD/DEV ou host E2E ausente no bundle.')
  const configPath = join(directory, E2E_NATIVE_HOST_CONFIG)
  const manifestPath = join(directory, E2E_NATIVE_HOST_NAME + '.json')
  const planPath = join(directory, 'integration-plan.json')
  for (const target of [configPath, manifestPath, planPath]) requireCondition(!existsSync(target), 'Arquivo E2E existente; revisar sem sobrescrever: ' + target)
  const config = { version: 1, projectRoot, userDataPath: profile, extensionId }
  // Validate the ID before the first write too; official IDs are never accepted.
  requireCondition(!['agefiaohfielfgadiagemnflekbboblp', 'alnngjgmhiebpnjefjmhbhmhfpgoibnh', 'lfneneebngmiikddoddnlcgobfjkodpm'].includes(extensionId), 'ID oficial/DEV proibido.')
  mkdirSync(directory, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' })
  const paths = loadE2EHostConfiguration(configPath)
  const manifest = createE2EHostManifest(paths)
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  writeFileSync(manifestPath, manifestText, { flag: 'wx' })
  const plan = {
    state: 'PREPARED_ONLY_NOT_REGISTERED', hostName: E2E_NATIVE_HOST_NAME, extensionId,
    extensionDirectory, configPath, manifestPath, manifestSha256: createHash('sha256').update(manifestText).digest('hex'),
    databasePath: join(profile, 'data', 'library.sqlite'), endpoint: paths.endpoint, secretPath: paths.secretPath, logPath: paths.logPath,
    registry: { inspected: false, approvalRequired: true, preflight: 'Read the exact E2E key immediately before creation; abort if it exists. No overwrite.',
      conditionalOnAbsent: planE2ERegistration(manifestPath, null), ownership: 'After creation and exact read-back, record version, key, manifestPath, manifestSha256 and previouslyAbsent=true.',
      cleanup: 'Require unchanged ownership receipt, manifest hash, default value and absence of additional values/subkeys; otherwise stop.' },
    brave: { opened: false, profileDirectory: join(projectRoot, 'artifacts', 'brave-e2e', 'auritest-01'),
      arguments: ['--user-data-dir=' + join(projectRoot, 'artifacts', 'brave-e2e', 'auritest-01'), '--no-first-run', '--no-default-browser-check'],
      extensionLoad: 'Future only: brave://extensions, developer mode, load unpacked from extensionDirectory; verify extensionId before connecting.',
      warning: 'A separate browser profile does not isolate HKCU Native Messaging.' },
    desktop: { started: false, environment: { AURI_E2E_USER_DATA: profile }, command: 'Existing unpackaged Desktop build, start manually after validating the profile.' }
  }
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' })
  return plan
}
