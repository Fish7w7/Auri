import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEV_NATIVE_HOST_NAME = 'app.auri.native_host.dev'
export const DEV_NATIVE_HOST_DESCRIPTION = 'Auri Native Host Development'
export const CHROME_DEV_REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${DEV_NATIVE_HOST_NAME}`
export const EDGE_DEV_REGISTRY_KEY = `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${DEV_NATIVE_HOST_NAME}`

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function validateExtensionId(value) {
  if (!EXTENSION_ID_PATTERN.test(value)) throw new Error(`ID de extensão inválido: ${value}. Esperado: 32 caracteres entre a e p.`)
  return value
}

export function extensionOrigin(extensionId) {
  return `chrome-extension://${validateExtensionId(extensionId)}/`
}

export function resolveDevIntegrationPaths(projectRoot = root) {
  const directory = join(resolve(projectRoot), 'artifacts', 'native-host', 'dev')
  return {
    directory,
    executablePath: join(directory, 'AuriNativeHostDev.exe'),
    manifestPath: join(directory, `${DEV_NATIVE_HOST_NAME}.json`)
  }
}

export function createDevHostManifest(executablePath, extensionIds) {
  if (!isAbsolute(executablePath)) throw new Error('O path do Native Host DEV precisa ser absoluto.')
  const allowedOrigins = [...new Set(extensionIds.map(extensionOrigin))]
  if (allowedOrigins.length === 0) throw new Error('Informe pelo menos um ID de extensão autorizado.')
  return {
    name: DEV_NATIVE_HOST_NAME,
    description: DEV_NATIVE_HOST_DESCRIPTION,
    path: resolve(executablePath),
    type: 'stdio',
    allowed_origins: allowedOrigins
  }
}

export function parseRegisterArguments(argumentsList) {
  let chromeExtensionId
  let edgeExtensionId
  for (const argument of argumentsList) {
    if (argument.startsWith('--chrome-extension-id=')) chromeExtensionId = validateExtensionId(argument.slice('--chrome-extension-id='.length))
    else if (argument.startsWith('--edge-extension-id=')) edgeExtensionId = validateExtensionId(argument.slice('--edge-extension-id='.length))
    else throw new Error(`Argumento desconhecido: ${argument}.`)
  }
  if (!chromeExtensionId && !edgeExtensionId) throw new Error('Informe --chrome-extension-id e/ou --edge-extension-id.')
  return { chromeExtensionId, edgeExtensionId }
}

export function parseUnregisterArguments(argumentsList) {
  if (argumentsList.length === 0) return { chrome: true, edge: true }
  let chrome = false
  let edge = false
  for (const argument of argumentsList) {
    if (argument === '--chrome') chrome = true
    else if (argument === '--edge') edge = true
    else throw new Error(`Argumento desconhecido: ${argument}.`)
  }
  return { chrome, edge }
}

export function createRegistryAdapter(run = runRegExe) {
  return {
    readDefault(registryKey) {
      const result = run(['query', registryKey, '/ve'])
      if (result.status === 1) return null
      assertRegistrySuccess(result, `consultar ${registryKey}`)
      const match = result.stdout.match(/REG_SZ\s+(.+)\r?$/m)
      if (!match) throw new Error(`O valor padrão de ${registryKey} não pôde ser interpretado.`)
      return match[1].trim()
    },
    setDefault(registryKey, manifestPath) {
      assertRegistrySuccess(run(['add', registryKey, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f']), `registrar ${registryKey}`)
    },
    deleteKey(registryKey) {
      assertRegistrySuccess(run(['delete', registryKey, '/f']), `remover ${registryKey}`)
    }
  }
}

export function registerDevelopmentHost(options, dependencies = {}) {
  const paths = resolveDevIntegrationPaths(options.projectRoot)
  if (!existsSync(paths.executablePath)) throw new Error(`AuriNativeHostDev.exe não encontrado. Execute npm run build:native-host:dev primeiro.`)
  const registry = dependencies.registry ?? createRegistryAdapter()
  const previousOrigins = readExistingAllowedOrigins(paths.manifestPath, paths.executablePath)
  const requestedIds = [options.chromeExtensionId, options.edgeExtensionId].filter(Boolean)
  const requestedOrigins = requestedIds.map(extensionOrigin)
  const extensionIds = [...new Set([...previousOrigins, ...requestedOrigins])].map(originToExtensionId)
  const manifest = createDevHostManifest(paths.executablePath, extensionIds)

  const registrations = [
    ...(options.chromeExtensionId ? [{ browser: 'Chrome', key: CHROME_DEV_REGISTRY_KEY }] : []),
    ...(options.edgeExtensionId ? [{ browser: 'Edge', key: EDGE_DEV_REGISTRY_KEY }] : [])
  ]
  for (const registration of registrations) {
    const current = registry.readDefault(registration.key)
    if (current && !samePath(current, paths.manifestPath)) {
      throw new Error(`${registration.browser} já possui ${DEV_NATIVE_HOST_NAME} apontando para outro manifest. Nenhuma chave foi alterada.`)
    }
  }

  mkdirSync(paths.directory, { recursive: true })
  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  for (const registration of registrations) registry.setDefault(registration.key, paths.manifestPath)
  return { ...paths, manifest, browsers: registrations.map(({ browser }) => browser) }
}

export function unregisterDevelopmentHost(options = {}, dependencies = {}) {
  const paths = resolveDevIntegrationPaths(options.projectRoot)
  const registry = dependencies.registry ?? createRegistryAdapter()
  const browsers = options.browsers ?? { chrome: true, edge: true }
  const targets = [
    ...(browsers.chrome ? [{ browser: 'Chrome', key: CHROME_DEV_REGISTRY_KEY }] : []),
    ...(browsers.edge ? [{ browser: 'Edge', key: EDGE_DEV_REGISTRY_KEY }] : [])
  ]
  const removed = []
  const skipped = []
  for (const target of targets) {
    const current = registry.readDefault(target.key)
    if (!current) continue
    if (!samePath(current, paths.manifestPath)) {
      skipped.push(target.browser)
      continue
    }
    registry.deleteKey(target.key)
    removed.push(target.browser)
  }
  return { manifestPath: paths.manifestPath, removed, skipped }
}

function readExistingAllowedOrigins(manifestPath, executablePath) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== DEV_NATIVE_HOST_NAME || !samePath(manifest.path, executablePath) || !Array.isArray(manifest.allowed_origins)) return []
    return manifest.allowed_origins.filter((origin) => typeof origin === 'string' && /^chrome-extension:\/\/[a-p]{32}\/$/.test(origin))
  } catch { return [] }
}

function originToExtensionId(origin) {
  return origin.slice('chrome-extension://'.length, -1)
}

function samePath(left, right) {
  return resolve(left).toLocaleLowerCase('en-US') === resolve(right).toLocaleLowerCase('en-US')
}

function runRegExe(argumentsList) {
  if (process.platform !== 'win32') throw new Error('O registro DEV do Native Host está disponível somente no Windows.')
  const result = spawnSync('reg.exe', argumentsList, { encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function assertRegistrySuccess(result, operation) {
  if (result.status !== 0) throw new Error(`Falha ao ${operation}: ${result.stderr.trim() || `reg.exe retornou ${result.status}`}`)
}

async function main() {
  const [command, ...argumentsList] = process.argv.slice(2)
  if (command === 'register') {
    const options = parseRegisterArguments(argumentsList)
    const result = registerDevelopmentHost(options)
    process.stdout.write(`Manifest DEV: ${result.manifestPath}\nRegistrado para: ${result.browsers.join(', ')}\n`)
    return
  }
  if (command === 'unregister') {
    const browsers = parseUnregisterArguments(argumentsList)
    const result = unregisterDevelopmentHost({ browsers })
    process.stdout.write(`Removido de: ${result.removed.join(', ') || 'nenhum'}\n`)
    if (result.skipped.length) process.stdout.write(`Mantido por segurança em: ${result.skipped.join(', ')}\n`)
    return
  }
  throw new Error('Use register ou unregister.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

