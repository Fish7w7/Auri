// Read/extract the local installer as data. Never run Setup, Auri or the Native Host.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { extractFile, listPackage } from '@electron/asar'
import yaml from 'js-yaml'
import { blake2b } from '@noble/hashes/blake2.js'
import { embeddedConfig, validateEmbeddedInput, validateEmbeddedFiles } from '../build/prepare-browser-extension.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const release = resolve(root, process.argv[3] ?? 'release')
const filename = `Auri-Setup-${pkg.version}-x64.exe`
const setupPath = join(release, filename)
const audit = process.argv[3] ? join(release, 'verification') : join(root, 'artifacts/release-audit', pkg.version)
const extracted = join(audit, 'extracted')
const sevenZip = process.argv[2]
assert(sevenZip, 'Pass the path of 7za.exe as the first argument.')
mkdirSync(extracted, { recursive: true })
const extraction = spawnSync(sevenZip, ['x', '-y', `-o${extracted}`, setupPath, 'Auri.exe', 'resources/app.asar', 'resources/app.asar.unpacked/*', 'resources/native-host/*', 'resources/browser-extension/*', 'resources/browser-extension-integrity.json'], { windowsHide: true, shell: false, encoding: 'utf8' })
writeFileSync(join(audit, 'extraction.txt'), (extraction.stdout ?? '') + (extraction.stderr ?? ''))
assert(extraction.status === 0 || extraction.status === 1, 'Installer extraction failed.')

const source = await validateEmbeddedInput(readFileSync(resolve(root, embeddedConfig.zipPath)), readFileSync(resolve(root, embeddedConfig.metadataPath)))
function readTree(folder, prefix = '') {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    assert(!entry.isSymbolicLink(), 'Unexpected symlink')
    const name = prefix + entry.name
    return entry.isDirectory() ? readTree(join(folder, entry.name), name + '/') : [[name, readFileSync(join(folder, entry.name))]]
  })
}
const files = new Map(readTree(join(extracted, 'resources/browser-extension')))
assert.deepEqual([...files.keys()].sort(), [...source.files.keys()].sort())
for (const [name, bytes] of files) assert(bytes.equals(source.files.get(name)), `Embedded bytes differ: ${name}`)
const embedded = validateEmbeddedFiles(files)
assert.deepEqual(JSON.parse(readFileSync(join(extracted, 'resources/browser-extension-integrity.json'), 'utf8')), embedded)

const nativeHost = readFileSync(join(extracted, 'resources/native-host/AuriNativeHost.exe'))
const executable = readFileSync(join(extracted, 'Auri.exe'))
assert.equal(executable.subarray(0, 2).toString(), 'MZ')
assert.equal(nativeHost.subarray(0, 2).toString(), 'MZ')
assert(nativeHost.equals(readFileSync(join(root, 'artifacts/native-host/AuriNativeHost.exe'))), 'Native Host differs from build')
for (const forbidden of ['app.auri.native_host.dev', 'app.auri.native_host.e2e', 'Auri-Dev', 'AuriNativeHostDev.exe']) assert(!nativeHost.includes(Buffer.from(forbidden)), `Forbidden Native Host content: ${forbidden}`)
const asar = join(extracted, 'resources/app.asar')
const shippedPackage = JSON.parse(extractFile(asar, 'package.json').toString())
assert.equal(shippedPackage.version, pkg.version)
assert.equal(shippedPackage.dependencies['@auri/protocol'], pkg.dependencies['@auri/protocol'])
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages
const archivePaths = listPackage(asar).map(path => path.replaceAll('\\', '/').replace(/^\//, ''))
const productionDependencies = Object.fromEntries(Object.keys(pkg.dependencies).map(name => {
  const path = `node_modules/${name}`
  const installed = JSON.parse(extractFile(asar, join(path, 'package.json')).toString())
  assert.equal(installed.version, lock[path].version, `ASAR dependency differs from lock: ${name}`)
  return [name, installed.version]
}))
const protocolEntry = join('node_modules', '@auri/protocol', 'dist', 'index.cjs')
assert(extractFile(asar, protocolEntry).equals(readFileSync(join(root, protocolEntry))), 'Protocol entry differs from installed dependency')
for (const path of archivePaths) {
  assert(!/(^|\/)(\.git|\.env[^/]*|e2e-profiles|secrets|credentials|backups|artifacts)(\/|$)|\.(auri-backup|db|sqlite3?|pem|key|pfx|p12|log)$/i.test(path), `Unexpected personal or temporary data in ASAR: ${path}`)
  assert(!/\/node_modules\/zod\/package\.json$/.test(path), `Unexpected second Zod installation: ${path}`)
}
const unpackedNativeFiles = readTree(join(extracted, 'resources/app.asar.unpacked')).filter(([name]) => /\.(dll|node)$/i.test(name)).map(([name, bytes]) => {
  assert(bytes.equals(readFileSync(join(root, name))), `Unpacked runtime differs: ${name}`)
  return name
})
assert(unpackedNativeFiles.some(name => name.endsWith('better-sqlite3/prebuilds/win32-x64.node')))
assert(unpackedNativeFiles.some(name => name.startsWith('node_modules/@img/sharp-win32-x64/lib/') && /\.(dll|node)$/i.test(name)))
for (const [name, bytes] of readTree(join(root, 'out'))) {
  assert(extractFile(asar, join('out', name)).equals(bytes), `Packaged app differs: ${name}`)
}

const setup = readFileSync(setupPath)
const hash = (algorithm, format = 'hex') => createHash(algorithm).update(setup).digest(format)
const update = yaml.load(readFileSync(join(release, 'latest.yml'), 'utf8'))
assert.equal(update.version, pkg.version)
assert.equal(update.path, filename)
assert.equal(update.sha512, hash('sha512', 'base64'))
assert.equal(update.files.length, 1)
assert.deepEqual({ url: update.files[0].url, size: update.files[0].size, sha512: update.files[0].sha512 }, { url: filename, size: setup.length, sha512: hash('sha512', 'base64') })
const compatibility = JSON.parse(readFileSync(join(release, 'auri-compatibility.json'), 'utf8'))
assert.deepEqual(compatibility, { version: pkg.version, minSchema: 1, maxSchema: 3 })

const blockmapBytes = readFileSync(setupPath + '.blockmap')
const blockmap = JSON.parse(gunzipSync(blockmapBytes).toString())
assert.equal(blockmap.version, '2')
assert.equal(blockmap.files.length, 1)
let blocks = 0
for (const file of blockmap.files) {
  assert.equal(file.offset, 0)
  assert.equal(file.sizes.length, file.checksums.length)
  let offset = file.offset
  for (let index = 0; index < file.sizes.length; index++) {
    const size = file.sizes[index]
    assert(size > 0 && offset + size <= setup.length)
    const actual = Buffer.from(blake2b(setup.subarray(offset, offset + size), { dkLen: 18 })).toString('base64')
    assert.equal(actual, file.checksums[index], `Blockmap checksum ${index}`)
    offset += size; blocks++
  }
  assert.equal(offset, setup.length)
}

// NSIS non-solid Deflate firstheader, decoded without executing the installer.
const firstHeader = setup.indexOf(Buffer.from('NullsoftInst')) - 8
assert(firstHeader > 0 && setup.readUInt32LE(firstHeader + 4) === 0xdeadbeef, 'Unexpected NSIS header')
const compressedLength = setup.readUInt32LE(firstHeader + 28)
assert(compressedLength >>> 31 === 1, 'Expected compressed NSIS header')
const header = inflateRawSync(setup.subarray(firstHeader + 32, firstHeader + 32 + (compressedLength & 0x7fffffff)))
assert.equal(header.length, setup.readUInt32LE(firstHeader + 20))
writeFileSync(join(audit, 'nsis-header.bin'), header)
const nsisText = header.toString('utf16le')
const origins = nsisText.match(/chrome-extension:\/\/[a-p]{32}\//g)
assert.deepEqual(origins?.sort(), [
  'chrome-extension://alnngjgmhiebpnjefjmhbhmhfpgoibnh/',
  'chrome-extension://agefiaohfielfgadiagemnflekbboblp/'
].sort())
for (const forbidden of ['kldacocmhefloboachmkpeojenaaocek', 'fbcmppmndedakdhfdffihoijoelkdhgi', 'app.auri.native_host.dev', 'app.auri.native_host.e2e', 'Auri-Dev', 'chrome-extension://*/', 'ExtensionInstallForcelist']) assert(!nsisText.includes(forbidden), `Forbidden NSIS content: ${forbidden}`)
for (const browser of ['Google\\Chrome', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser']) assert(nsisText.includes(`Software\\${browser}\\NativeMessagingHosts\\app.auri.native_host`))
assert(nsisText.includes('resources\\native-host\\AuriNativeHost.exe'))
assert(nsisText.includes('"allowed_origins"'))

const report = {
  version: pkg.version, setupPath, sizeBytes: setup.length,
  sha256: hash('sha256'), sha512Base64: hash('sha512', 'base64'), sha512Hex: hash('sha512'),
  blockmap: { path: setupPath + '.blockmap', sizeBytes: blockmapBytes.length, verifiedBlocks: blocks },
  latestValidated: true, compatibility, embedded, allowedOrigins: origins,
  nativeHostBytesMatch: true, packagedAppBytesMatch: true, productionDependencies, unpackedNativeFiles,
  nsisCompiledHeaderValidated: true, extractedPath: extracted,
  note: 'Setup was extracted as data, never executed. Authenticode checked separately with Get-AuthenticodeSignature.'
}
writeFileSync(join(audit, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
