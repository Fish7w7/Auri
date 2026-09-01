import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const schema = JSON.parse(readFileSync(resolve(root, 'schema-compatibility.json'), 'utf8'))

if (!Number.isInteger(schema.minSchema) || !Number.isInteger(schema.maxSchema) || schema.minSchema < 0 || schema.minSchema > schema.maxSchema) {
  throw new Error('schema-compatibility.json possui limites inválidos.')
}

const destination = resolve(root, 'build', 'generated', 'auri-compatibility.json')
mkdirSync(resolve(root, 'build', 'generated'), { recursive: true })
writeFileSync(destination, `${JSON.stringify({
  version: packageJson.version,
  minSchema: schema.minSchema,
  maxSchema: schema.maxSchema
}, null, 2)}\n`)
