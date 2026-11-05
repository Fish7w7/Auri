import { build } from 'esbuild'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Preparation only. No browser, Desktop, registry adapter, shell or global installation is invoked.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
if (args.length !== 1 || !isAbsolute(args[0])) throw new Error('Informe somente a raiz absoluta de Auri-Extension.')
const result = await build({
  entryPoints: [join(root, 'src/native-host/e2e-preparation.ts')], bundle: true, write: false,
  format: 'esm', platform: 'node', target: 'node22', alias: { '@shared': join(root, 'src/shared') }
})
const tools = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
const plan = tools.prepareE2EIntegration(root, args[0])
process.stdout.write(JSON.stringify(plan, null, 2) + '\n')
