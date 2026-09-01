import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROD_NATIVE_HOST_NAME = 'app.auri.native_host'
export const PROD_NATIVE_HOST_DESCRIPTION = 'Auri Desktop Native Messaging Host'
export const CHROME_PROD_REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${PROD_NATIVE_HOST_NAME}`
export const EDGE_PROD_REGISTRY_KEY = `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${PROD_NATIVE_HOST_NAME}`
export const BRAVE_PROD_REGISTRY_KEY = `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${PROD_NATIVE_HOST_NAME}`

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const PACKAGING_MODES = ['release', 'test']
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function validateProductionExtensionId(value) {
  const normalized = value.trim()
  if (!EXTENSION_ID_PATTERN.test(normalized)) throw new Error(`ID de extensão inválido: ${value}. Esperado: 32 caracteres entre a e p.`)
  return normalized
}

export function extensionOrigin(extensionId) {
  return `chrome-extension://${validateProductionExtensionId(extensionId)}/`
}

export function loadProductionExtensionConfiguration(environment = process.env, config = readProductionConfig(root)) {
  const mode = environment.AURI_NATIVE_HOST_PACKAGING_MODE?.trim() || 'release'
  if (!PACKAGING_MODES.includes(mode)) throw new Error(`Modo de empacotamento do Native Host inválido: ${mode}.`)
  const byBrowser = Object.fromEntries(Object.entries(config.extensionIdEnvironmentVariables).flatMap(([browser, variable]) => {
    const value = environment[variable]?.trim()
    return value ? [[browser, validateProductionExtensionId(value)]] : []
  }))
  const extensionIds = [...new Set(Object.values(byBrowser))]
  if (extensionIds.length === 0) {
    if (mode === 'release') throw new Error('IDs de produção da Auri Extension não configurados.')
    throw new Error('O modo de teste exige pelo menos um ID de extensão explicitamente configurado.')
  }
  return { mode, byBrowser, extensionIds, allowedOrigins: extensionIds.map(extensionOrigin) }
}

export function createProductionHostManifest(executablePath, extensionIds) {
  if (!win32.isAbsolute(executablePath)) throw new Error('O path do Native Host PROD precisa ser absoluto no Windows.')
  const allowedOrigins = [...new Set(extensionIds.map(extensionOrigin))]
  if (allowedOrigins.length === 0) throw new Error('IDs de produção da Auri Extension não configurados.')
  return {
    name: PROD_NATIVE_HOST_NAME,
    description: PROD_NATIVE_HOST_DESCRIPTION,
    path: win32.normalize(executablePath),
    type: 'stdio',
    allowed_origins: allowedOrigins
  }
}

export function productionRegistrations(manifestPath) {
  return [
    { browser: 'Chrome', key: CHROME_PROD_REGISTRY_KEY, manifestPath },
    { browser: 'Edge', key: EDGE_PROD_REGISTRY_KEY, manifestPath },
    { browser: 'Brave', key: BRAVE_PROD_REGISTRY_KEY, manifestPath }
  ]
}

export function installProductionRegistrations(registry, manifestPath) {
  const registrations = productionRegistrations(manifestPath)
  for (const registration of registrations) registry.setDefault(registration.key, manifestPath)
  return registrations
}

export function uninstallProductionRegistrations(registry, manifestPath) {
  const removed = []
  const skipped = []
  for (const registration of productionRegistrations(manifestPath)) {
    const current = registry.readDefault(registration.key)
    if (!current) continue
    if (!sameWindowsPath(current, manifestPath)) {
      skipped.push(registration.browser)
      continue
    }
    registry.deleteKey(registration.key)
    removed.push(registration.browser)
  }
  return { removed, skipped }
}

export function createProductionInstallerInclude(allowedOrigins) {
  if (allowedOrigins.length === 0) throw new Error('IDs de produção da Auri Extension não configurados.')
  for (const origin of allowedOrigins) {
    if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin)) throw new Error(`Origin inválida para Native Messaging: ${origin}.`)
  }
  const originWrites = allowedOrigins.map((origin, index) => (
    `  FileWrite $R1 '    "${origin}"${index < allowedOrigins.length - 1 ? ',' : ''}$\\r$\\n'`
  ))
  const registryKeys = productionRegistrations('manifest').map(({ key }) => key.slice('HKCU\\'.length))
  const manifestRelativePath = `resources\\native-host\\${PROD_NATIVE_HOST_NAME}.json`
  const executableRelativePath = 'resources\\native-host\\AuriNativeHost.exe'
  const registrationWrites = registryKeys.map((key) => `  WriteRegStr HKCU "${key}" "" "$INSTDIR\\${manifestRelativePath}"`)
  const registrationRemovals = registryKeys.flatMap((key, index) => [
    `  ReadRegStr $R0 HKCU "${key}" ""`,
    `  StrCmp $R0 "$INSTDIR\\${manifestRelativePath}" 0 auri_registry_${index}_done`,
    `  DeleteRegKey HKCU "${key}"`,
    `  auri_registry_${index}_done:`
  ])

  return `${[
    '!ifndef BUILD_UNINSTALLER',
    'Function AuriEscapeNativeHostJsonPath',
    '  Exch $0',
    '  Push $1',
    '  Push $2',
    '  Push $3',
    '  StrCpy $1 ""',
    '  StrCpy $2 0',
    '  auri_escape_path_loop:',
    '  StrCpy $3 $0 1 $2',
    '  StrCmp $3 "" auri_escape_path_done',
    '  StrCmp $3 "\\" 0 auri_escape_path_append',
    '  StrCpy $1 "$1\\\\"',
    '  Goto auri_escape_path_next',
    '  auri_escape_path_append:',
    '  StrCpy $1 "$1$3"',
    '  auri_escape_path_next:',
    '  IntOp $2 $2 + 1',
    '  Goto auri_escape_path_loop',
    '  auri_escape_path_done:',
    '  StrCpy $0 $1',
    '  Pop $3',
    '  Pop $2',
    '  Pop $1',
    '  Exch $0',
    'FunctionEnd',
    '!endif',
    '',
    '!macro customInstall',
    `  IfFileExists "$INSTDIR\\${executableRelativePath}" auri_native_host_present 0`,
    '  MessageBox MB_ICONSTOP|MB_OK "AuriNativeHost.exe não foi instalado."',
    '  Abort',
    '  auri_native_host_present:',
    `  StrCpy $R0 "$INSTDIR\\${executableRelativePath}"`,
    '  Push $R0',
    '  Call AuriEscapeNativeHostJsonPath',
    '  Pop $R0',
    '  ClearErrors',
    `  FileOpen $R1 "$INSTDIR\\${manifestRelativePath}" w`,
    '  IfErrors 0 auri_native_host_manifest_open',
    '  MessageBox MB_ICONSTOP|MB_OK "O manifest do Auri Native Host não pôde ser criado."',
    '  Abort',
    '  auri_native_host_manifest_open:',
    "  FileWrite $R1 '{$\\r$\\n'",
    `  FileWrite $R1 '  "name": "${PROD_NATIVE_HOST_NAME}",$\\r$\\n'`,
    `  FileWrite $R1 '  "description": "${PROD_NATIVE_HOST_DESCRIPTION}",$\\r$\\n'`,
    "  FileWrite $R1 '  \"path\": \"$R0\",$\\r$\\n'",
    "  FileWrite $R1 '  \"type\": \"stdio\",$\\r$\\n'",
    "  FileWrite $R1 '  \"allowed_origins\": [$\\r$\\n'",
    ...originWrites,
    "  FileWrite $R1 '  ]$\\r$\\n'",
    "  FileWrite $R1 '}$\\r$\\n'",
    '  FileClose $R1',
    ...registrationWrites,
    '!macroend',
    '',
    '!macro customUnInstall',
    ...registrationRemovals,
    '!macroend',
    ''
  ].join('\n')}`
}

export function prepareProductionPackaging(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? root)
  const config = options.config ?? readProductionConfig(projectRoot)
  const configuration = loadProductionExtensionConfiguration(options.environment ?? process.env, config)
  if (options.requireRelease && configuration.mode !== 'release') throw new Error('O pipeline oficial exige AURI_NATIVE_HOST_PACKAGING_MODE=release.')
  const executablePath = join(projectRoot, 'artifacts', 'native-host', 'AuriNativeHost.exe')
  if (!existsSync(executablePath)) throw new Error('AuriNativeHost.exe não encontrado. Execute npm run build:native-host primeiro.')
  const outputDirectory = join(projectRoot, 'artifacts', 'native-host', 'production')
  const includePath = join(outputDirectory, 'installer-generated.nsh')
  const metadataPath = join(outputDirectory, 'packaging-metadata.json')
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(includePath, createProductionInstallerInclude(configuration.allowedOrigins), 'utf8')
  writeFileSync(metadataPath, `${JSON.stringify({
    mode: configuration.mode,
    hostName: PROD_NATIVE_HOST_NAME,
    allowedOrigins: configuration.allowedOrigins
  }, null, 2)}\n`, 'utf8')
  return { executablePath, includePath, metadataPath, ...configuration }
}

function readProductionConfig(projectRoot) {
  return JSON.parse(readFileSync(join(projectRoot, 'build', 'native-host-production.config.json'), 'utf8'))
}

function sameWindowsPath(left, right) {
  return win32.resolve(left).toLocaleLowerCase('en-US') === win32.resolve(right).toLocaleLowerCase('en-US')
}

async function main() {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--release')
  if (unknownArguments.length) throw new Error(`Argumento desconhecido: ${unknownArguments[0]}.`)
  const result = prepareProductionPackaging({ requireRelease: process.argv.includes('--release') })
  process.stdout.write(`Native Host PROD preparado em modo ${result.mode.toUpperCase()} para ${result.allowedOrigins.length} origin(s).\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
