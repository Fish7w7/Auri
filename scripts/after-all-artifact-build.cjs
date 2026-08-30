const { copyFileSync } = require('node:fs')
const { resolve } = require('node:path')

exports.default = async function afterAllArtifactBuild(context) {
  const source = resolve(__dirname, '..', 'build', 'auri-compatibility.json')
  const destination = resolve(context.outDir, 'auri-compatibility.json')
  copyFileSync(source, destination)
  return [destination]
}
