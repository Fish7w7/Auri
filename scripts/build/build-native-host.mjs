import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { assertPrivateBuildDirectory, inspectNativeHostOutput, prepareAndPublishNativeHost } from './native-host-output.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='))
const mode = modeArgument?.slice('--mode='.length) ?? 'prod'
if (mode !== 'prod' && mode !== 'dev' && mode !== 'e2e') throw new Error(`Modo de build inválido: ${mode}.`)
const executableName = mode === 'e2e' ? 'AuriNativeHostE2E.exe' : mode === 'dev' ? 'AuriNativeHostDev.exe' : 'AuriNativeHost.exe'
const nativeHostDirectory = join(root, 'artifacts', 'native-host')
const outputArgument = process.argv.find(argument => argument.startsWith('--output-directory='))?.slice('--output-directory='.length)
const defaultDirectory = mode === 'prod' ? nativeHostDirectory : join(nativeHostDirectory, mode)
const outputDirectory = outputArgument ? resolve(root, outputArgument) : defaultDirectory
if (outputArgument) {
  const suffix = relative(join(nativeHostDirectory, 'candidates'), outputDirectory)
  if (!suffix || suffix === '..' || suffix.startsWith('..' + sep) || isAbsolute(suffix)) throw new Error('Output alternativo precisa ficar dentro de artifacts/native-host/candidates.')
}
const existing = inspectNativeHostOutput(outputDirectory, executableName)
if (existing.exists) throw new Error('Destino anterior preservado: use --output-directory=artifacts/native-host/candidates/<novo-id>. Sem substituição automática.')
const buildDirectory = join(nativeHostDirectory, '.build')
assertPrivateBuildDirectory(buildDirectory)
mkdirSync(buildDirectory, { recursive: true })
assertPrivateBuildDirectory(buildDirectory)
const workDirectory = mkdtempSync(join(buildDirectory, mode + '-'))
const bundlePath = join(workDirectory, 'auri-native-host.cjs')
const seaConfigPath = join(workDirectory, 'sea-config.json')
const seaBlobPath = join(workDirectory, 'sea-prep.blob')
const executablePath = join(outputDirectory, executableName)
const postjectCli = join(root, 'node_modules', 'postject', 'dist', 'cli.js')
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'


await build({
  entryPoints: [join(root, 'src', 'native-host', mode === 'e2e' ? 'e2e-index.ts' : 'index.ts')],
  bundle: true,
  outfile: bundlePath,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  sourcemap: false,
  logLevel: 'warning',
  define: {
    __AURI_NATIVE_HOST_BUILD_MODE__: JSON.stringify(mode),
    __AURI_NATIVE_HOST_USER_DATA_DIRECTORY__: JSON.stringify(mode === 'dev' ? 'Auri-Dev' : 'Auri'),
    __AURI_NATIVE_HOST_PIPE_PREFIX__: JSON.stringify(mode === 'dev' ? 'auri-desktop-dev' : 'auri-desktop')
  },
  plugins: [{
    name: 'auri-path-aliases',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@shared\// }, (args) => ({
        path: `${join(root, 'src', 'shared', args.path.slice('@shared/'.length))}.ts`
      }))
    }
  }]
})

writeFileSync(seaConfigPath, JSON.stringify({
  main: bundlePath,
  output: seaBlobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false
}, null, 2))

run(process.execPath, ['--experimental-sea-config', seaConfigPath], 'criar o blob SEA')
await prepareAndPublishNativeHost({
  directory: outputDirectory, name: executableName, sourceExecutable: process.execPath,
  prepare: temporaryExecutable => run(process.execPath, [
    postjectCli, temporaryExecutable, 'NODE_SEA_BLOB', seaBlobPath,
    '--sentinel-fuse', seaFuse, '--overwrite'
  ], 'injetar o Native Host somente no temporário exclusivo'),
  validate: temporaryExecutable => { if (mode === 'prod') assertProductionExecutable(temporaryExecutable) }
})
// Unique work products remain ignored for diagnostics; no recursive cleanup of existing trees.

process.stdout.write(`${executableName} (${mode.toUpperCase()}) criado em ${executablePath}\n`)

function run(command, args, operation) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) throw new Error(`Falha ao ${operation} (código ${result.status ?? 'desconhecido'}).`)
}

function assertProductionExecutable(path) {
  const executable = readFileSync(path)
  for (const forbidden of ['app.auri.native_host.dev', 'AuriNativeHostDev.exe', 'Auri-Dev']) {
    if (executable.includes(Buffer.from(forbidden))) {
      throw new Error(`O Native Host PROD contém referência DEV proibida: ${forbidden}.`)
    }
  }
}
