import { createHash, createPublicKey } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { registerDevelopmentHost } from './native-host.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const developmentConfig = JSON.parse(readFileSync(join(root, 'build', 'browser-extension-dev.public.json'), 'utf8'))
const OFFICIAL_EXTENSION_IDS = new Set([
  'agefiaohfielfgadiagemnflekbboblp',
  'alnngjgmhiebpnjefjmhbhmhfpgoibnh'
])

export function calculateExtensionId(publicKey) {
  const bytes = Buffer.from(publicKey.replace(/\s+/gu, ''), 'base64')
  createPublicKey({ key: bytes, format: 'der', type: 'spki' })
  return createHash('sha256').update(bytes).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)))
}

export function validateDevelopmentConfig(config = developmentConfig) {
  const keyBytes = Buffer.from(config.publicKey.replace(/\s+/gu, ''), 'base64')
  const extensionId = calculateExtensionId(config.publicKey)
  const fingerprint = createHash('sha256').update(keyBytes).digest('hex')
  assert(extensionId === config.extensionId, 'O ID DEV não corresponde à chave pública configurada.')
  assert(fingerprint === config.publicKeySha256, 'O fingerprint da chave pública DEV diverge da configuração.')
  assert(!OFFICIAL_EXTENSION_IDS.has(extensionId), 'A identidade DEV não pode reutilizar um ID oficial de produção.')
  return { extensionId, fingerprint }
}

export function prepareDevelopmentExtension(sourceDirectory, outputDirectory, config = developmentConfig) {
  const identity = validateDevelopmentConfig(config)
  assert(existsSync(join(sourceDirectory, 'manifest.json')), 'Build dev-native da Auri Extension não encontrado.')
  const sourceFiles = listFiles(sourceDirectory)
  const sourceText = sourceFiles.filter((path) => path.endsWith('.js'))
    .map((path) => readFileSync(path, 'utf8')).join('\n')
  assert(sourceText.includes('app.auri.native_host.dev'), 'O build da Extension não usa o Native Host DEV.')
  assert(!/["']app\.auri\.native_host["']/u.test(sourceText), 'O build DEV contém referência ao Native Host PROD.')

  rmSync(outputDirectory, { recursive: true, force: true })
  mkdirSync(dirname(outputDirectory), { recursive: true })
  cpSync(sourceDirectory, outputDirectory, { recursive: true })
  const manifestPath = join(outputDirectory, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.name = 'Auri Extension DEV'
  manifest.version_name = `${manifest.version} DEV`
  manifest.key = config.publicKey
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { ...identity, outputDirectory: resolve(outputDirectory), manifestPath: resolve(manifestPath), manifest }
}

export function resolveDevelopmentExtensionPaths(projectRoot = root, extensionRoot = resolve(projectRoot, '..', 'Auri-Extension')) {
  return {
    extensionRoot: resolve(extensionRoot),
    extensionBuild: resolve(extensionRoot, 'artifacts', 'dev-native'),
    outputDirectory: resolve(projectRoot, 'build', 'generated', 'browser-extension-dev')
  }
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Link simbólico proibido no build DEV: ${path}`)
    return entry.isDirectory() ? listFiles(path) : statSync(path).isFile() ? [path] : []
  })
}

function runNpmScript(directory, script) {
  const npmCli = process.env.npm_execpath
  assert(npmCli && existsSync(npmCli), 'Execute este fluxo por npm run dev:extension:setup.')
  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: directory,
    stdio: 'inherit',
    windowsHide: true
  })
  if (result.status !== 0) throw new Error(`Falha ao executar npm run ${script} em ${directory}.`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const paths = resolveDevelopmentExtensionPaths()
  assert(existsSync(join(paths.extensionRoot, 'package.json')), `Auri-Extension não encontrada em ${paths.extensionRoot}.`)
  runNpmScript(paths.extensionRoot, 'build:dev:native')
  const prepared = prepareDevelopmentExtension(paths.extensionBuild, paths.outputDirectory)
  runNpmScript(root, 'build:native-host:dev')
  const registration = registerDevelopmentHost({
    projectRoot: root,
    braveExtensionId: prepared.extensionId,
    replaceAllowedOrigins: true
  })
  process.stdout.write([
    '',
    'Auri Extension DEV preparada.',
    `ID DEV: ${prepared.extensionId}`,
    `Pasta para Carregar sem compactação: ${prepared.outputDirectory}`,
    `Manifest Native Host DEV: ${registration.manifestPath}`,
    'Registro DEV: Brave (HKCU)',
    'Inicie o Desktop separadamente com: npm run dev',
    ''
  ].join('\n'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
