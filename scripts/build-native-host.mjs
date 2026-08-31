import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = join(root, 'artifacts', 'native-host')
const workDirectory = join(outputDirectory, '.build')
const bundlePath = join(workDirectory, 'auri-native-host.cjs')
const seaConfigPath = join(workDirectory, 'sea-config.json')
const seaBlobPath = join(workDirectory, 'sea-prep.blob')
const executablePath = join(outputDirectory, 'AuriNativeHost.exe')
const postjectCli = join(root, 'node_modules', 'postject', 'dist', 'cli.js')
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

rmSync(workDirectory, { recursive: true, force: true })
mkdirSync(workDirectory, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'native-host', 'index.ts')],
  bundle: true,
  outfile: bundlePath,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  sourcemap: false,
  logLevel: 'warning',
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
copyFileSync(process.execPath, executablePath)
run(process.execPath, [
  postjectCli, executablePath, 'NODE_SEA_BLOB', seaBlobPath,
  '--sentinel-fuse', seaFuse, '--overwrite'
], 'injetar o Native Host no executável')

process.stdout.write(`AuriNativeHost.exe criado em ${executablePath}\n`)

function run(command, args, operation) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) throw new Error(`Falha ao ${operation} (código ${result.status ?? 'desconhecido'}).`)
}
