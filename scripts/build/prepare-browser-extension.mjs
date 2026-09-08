import { createHash, createPublicKey } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yauzl from 'yauzl'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const embeddedConfig = JSON.parse(readFileSync(join(root, 'build/browser-extension.config.json'), 'utf8'))
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
function check(condition, message) { if (!condition) throw new Error(`Embedded: ${message}`) }

export function validateEdgeStoreUrl(value) {
  const url = new URL(value)
  check(url.protocol === 'https:' && url.hostname === 'microsoftedge.microsoft.com' && !url.username && !url.password && !url.port && /^\/addons\/detail\/[^/]+(?:\/[^/]+)?\/?$/.test(url.pathname), 'URL pública do Edge Add-ons inválida.')
  return url.href
}

export function readZip(bytes) {
  return new Promise((resolveZip, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error)
      const files = new Map()
      const names = new Set()
      let total = 0
      const fail = (error) => { zip.close(); reject(error) }
      zip.on('error', fail)
      zip.on('end', () => resolveZip(files))
      zip.on('entry', (entry) => {
        try {
          const name = entry.fileName
          check(!name.includes('\\') && !name.startsWith('/') && !name.split('/').some((part) => part === '..' || part.includes(':')), 'path inseguro no ZIP.')
          check((entry.externalFileAttributes >>> 16 & 0xf000) !== 0xa000, 'symlink proibido.')
          check(!/(^|\/)(node_modules|tests?|__tests__|\.env[^/]*|\.git)(\/|$)|\.(map|pem|key|pfx|p12)$|\.(test|spec)\.[cm]?[jt]sx?$|secret|private[-_]?key/i.test(name), 'arquivo proibido no ZIP.')
          if (name.endsWith('/')) { zip.readEntry(); return }
          check(!names.has(name.toLowerCase()), 'arquivo duplicado.')
          names.add(name.toLowerCase())
          total += entry.uncompressedSize
          check(total <= 32 * 1024 * 1024 && files.size < 512, 'limite de extração excedido.')
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail(error)
            const chunks = []
            stream.on('error', fail)
            stream.on('data', (chunk) => chunks.push(chunk))
            stream.on('end', () => { files.set(name, Buffer.concat(chunks)); zip.readEntry() })
          })
        } catch (error) { fail(error) }
      })
      zip.readEntry()
    })
  })
}

export function validateEmbeddedFiles(files, config = embeddedConfig) {
  const manifest = JSON.parse(files.get('manifest.json')?.toString('utf8') ?? '{}')
  check(manifest.manifest_version === 3, 'manifestVersion divergente.')
  check(manifest.version === config.version, 'version divergente.')
  check(typeof manifest.key === 'string' && manifest.key.length > 0, 'key pública ausente.')
  const key = Buffer.from(manifest.key, 'base64')
  createPublicKey({ key, format: 'der', type: 'spki' })
  const fingerprint = sha256(key)
  check(fingerprint === config.publicKeySha256, 'fingerprint divergente.')
  const extensionId = fingerprint.slice(0, 32).replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)))
  check(extensionId === config.extensionId, 'extension ID divergente.')
  check(manifest.default_locale === 'en', 'default_locale divergente.')
  check(JSON.stringify([...manifest.permissions ?? []].sort()) === JSON.stringify(['activeTab', 'nativeMessaging', 'scripting']), 'permissões divergentes.')
  check(!manifest.host_permissions?.length && !manifest.optional_permissions?.length && !manifest.optional_host_permissions?.length, 'permissões extras.')
  for (const locale of ['en', 'pt_BR']) {
    const messages = JSON.parse(files.get(`_locales/${locale}/messages.json`)?.toString('utf8') ?? '{}')
    check(typeof messages.extensionName?.message === 'string', `locale ${locale} ausente/inválido.`)
  }
  for (const asset of [manifest.action?.default_popup, ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})]) {
    check(typeof asset === 'string' && files.has(asset), 'asset do manifest ausente.')
  }
  let productionHost = false
  for (const [name, bytes] of files) {
    const text = bytes.toString('utf8')
    check(!/app\.auri\.native_host\.dev|Auri-Dev|BEGIN [A-Z ]*PRIVATE KEY|sourceMappingURL|"private_key"/.test(text), 'conteúdo DEV/privado/sourcemap proibido.')
    if (name.endsWith('.js') && text.includes('app.auri.native_host')) productionHost = true
  }
  check(productionHost, 'host PROD ausente no bundle.')
  return { version: manifest.version, extensionId, sha256: config.sha256, filesCount: files.size, files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])) }
}

export async function validateEmbeddedInput(zipBytes, metadataBytes, config = embeddedConfig) {
  check(sha256(zipBytes) === config.sha256, 'SHA-256 do ZIP divergente.')
  check(sha256(metadataBytes) === config.metadataSha256, 'SHA-256 da metadata divergente.')
  const metadata = JSON.parse(metadataBytes.toString('utf8'))
  check(metadata.version === config.version && metadata.extensionId === config.extensionId && metadata.sha256 === config.sha256, 'metadata divergente do pacote.')
  check(metadata.manifestVersion === 3 && metadata.defaultLocale === 'en' && metadata.protocolVersion === 1 && metadata.hostName === 'app.auri.native_host', 'contrato da metadata divergente.')
  const files = await readZip(zipBytes)
  return { files, metadata: validateEmbeddedFiles(files, config) }
}

export async function prepareEmbedded() {
  const result = await validateEmbeddedInput(readFileSync(resolve(root, embeddedConfig.zipPath)), readFileSync(resolve(root, embeddedConfig.metadataPath)))
  // Fixed generated target, resolved and bounded before replacement.
  const output = resolve(root, 'build/generated/browser-extension')
  check(output.startsWith(resolve(root, 'build/generated') + '\\') || output.startsWith(resolve(root, 'build/generated') + '/'), 'destino fora do build.')
  rmSync(output, { force: true, recursive: true })
  for (const [name, bytes] of result.files) {
    const destination = join(output, name)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, bytes)
  }
  writeFileSync(join(root, 'build/generated/browser-extension-integrity.json'), JSON.stringify(result.metadata, null, 2) + '\n')
  return result.metadata
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--release')) validateEdgeStoreUrl(embeddedConfig.edgeStoreUrl)
  console.log(await prepareEmbedded())
}
