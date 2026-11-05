import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ZipFile } from 'yazl'
import { embeddedConfig as config, readZip, sha256, validateEmbeddedFiles, validateEmbeddedInput, validateEdgeStoreUrl } from '../../scripts/build/prepare-browser-extension.mjs'

const zip = readFileSync(resolve(config.zipPath))
const metadata = readFileSync(resolve(config.metadataPath))
const official = await validateEmbeddedInput(zip, metadata)
const manifest = JSON.parse(official.files.get('manifest.json')!.toString())
function changedManifest(change: Record<string, unknown>) {
  return new Map(official.files).set('manifest.json', Buffer.from(JSON.stringify({ ...manifest, ...change })))
}

describe('input Embedded oficial validado independentemente da metadata', () => {
  it('confere hashes, identidade, locales e inventário do ZIP real', () => {
    expect(sha256(zip)).toBe(config.sha256)
    expect(sha256(metadata)).toBe(config.metadataSha256)
    expect(official.metadata).toMatchObject({ version: '0.3.1', extensionId: 'agefiaohfielfgadiagemnflekbboblp', filesCount: 10 })
    expect(manifest).toMatchObject({ manifest_version: 3, default_locale: 'en', permissions: ['activeTab', 'scripting', 'nativeMessaging'] })
    expect(official.files.has('_locales/pt_BR/messages.json')).toBe(true)
  })
  it('falha fechado com ZIP adulterado', async () => {
    await expect(validateEmbeddedInput(Buffer.concat([zip, Buffer.from('x')]), metadata)).rejects.toThrow('SHA-256 do ZIP')
  })
  it('falha fechado com metadata adulterada', async () => {
    await expect(validateEmbeddedInput(zip, Buffer.concat([metadata, Buffer.from(' ')]))).rejects.toThrow('SHA-256 da metadata')
  })
  it.each([
    { manifest_version: 2 }, { version: '9.9.9' }, { key: undefined }, { key: 'invalid' },
    { default_locale: 'pt_BR' }, { permissions: ['activeTab', 'scripting'] },
    { permissions: [...manifest.permissions, 'tabs'] }, { permissions: [...manifest.permissions, 'activeTab'] },
    { host_permissions: ['<all_urls>'] }, { optional_permissions: ['tabs'] }
  ])('recusa manifest divergente: %j', (change) => {
    expect(() => validateEmbeddedFiles(changedManifest(change))).toThrow()
  })
  it.each(['extensionId', 'publicKeySha256'])('valida %s sem confiar apenas na metadata', (field) => {
    expect(() => validateEmbeddedFiles(official.files, { ...config, [field]: 'invalid' })).toThrow()
  })
  it.each(['_locales/en/messages.json', '_locales/pt_BR/messages.json', 'icons/auri-128.png', 'index.html'])('recusa arquivo obrigatório ausente: %s', (name) => {
    const files = new Map(official.files); files.delete(name)
    expect(() => validateEmbeddedFiles(files)).toThrow()
  })
  it.each(['app.auri.native_host.dev', 'Auri-Dev', '-----BEGIN PRIVATE KEY-----', '//# sourceMappingURL=popup.js.map'])('recusa conteúdo proibido %s', (text) => {
    expect(() => validateEmbeddedFiles(new Map(official.files).set('assets/popup.js', Buffer.from(text)))).toThrow()
  })
  it('exige host PROD no bundle', () => {
    expect(() => validateEmbeddedFiles(new Map(official.files).set('assets/popup.js', Buffer.from('other.host')))).toThrow('host PROD')
  })
  it.each(['version', 'extensionId', 'sha256', 'protocolVersion', 'hostName'])('valida conteúdo da metadata: %s', async (field) => {
    const bytes = Buffer.from(JSON.stringify({ ...JSON.parse(metadata.toString()), [field]: 'wrong' }))
    await expect(validateEmbeddedInput(zip, bytes, { ...config, metadataSha256: sha256(bytes) })).rejects.toThrow('metadata')
  })
  it.each(['tests/example.js', 'node_modules/example.js', '.env', 'private-key.pem', 'assets/example.js.map', 'assets/example.test.js'])('recusa arquivo proibido %s antes de extrair', async (name) => {
    const archive = new ZipFile(); archive.addBuffer(Buffer.from('x'), name); archive.end()
    const chunks: Buffer[] = []
    for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk))
    await expect(readZip(Buffer.concat(chunks))).rejects.toThrow('arquivo proibido')
  })
  it.each(['', 'https://evil.example/addons/detail/auri/id', 'file:///c:/x', 'https://user@microsoftedge.microsoft.com/addons/detail/auri/id'])('recusa URL da loja inválida %s', (url) => {
    expect(() => validateEdgeStoreUrl(url)).toThrow()
  })
  it('aceita exclusivamente URL pública configurada, fornecida pelo responsável', () => {
    expect(validateEdgeStoreUrl(config.edgeStoreUrl)).toBe('https://microsoftedge.microsoft.com/addons/detail/auri/alnngjgmhiebpnjefjmhbhmhfpgoibnh')
  })
})
