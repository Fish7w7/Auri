import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadProductionExtensionConfiguration, createProductionInstallerInclude, createProductionHostManifest } from '../../scripts/release/native-host-production.js'

const expected = ['chrome-extension://alnngjgmhiebpnjefjmhbhmhfpgoibnh/', 'chrome-extension://agefiaohfielfgadiagemnflekbboblp/']
describe('configuração de empacotamento 1.14.0', () => {
  it('configuração PROD gera exatamente Edge + Embedded, sem IDs de loja Chrome/Brave', () => {
    const configuration = loadProductionExtensionConfiguration({})
    expect(configuration.allowedOrigins).toEqual(expected)
    expect(configuration.byBrowser).toEqual({ edge: 'alnngjgmhiebpnjefjmhbhmhfpgoibnh' })
    const include = createProductionInstallerInclude(configuration.allowedOrigins)
    expect(include.match(/chrome-extension:\/\/[a-p]{32}\//g)).toEqual(expected)
    expect(include).not.toMatch(/kldacocmhefloboachmkpeojenaaocek|\*|app\.auri\.native_host\.dev|Auri-Dev|ExtensionInstall|Policies/)
    expect(createProductionHostManifest('C:\\Auri\\resources\\native-host\\AuriNativeHost.exe', configuration.extensionIds).allowed_origins).toEqual(expected)
    for (const browser of ['Google\\Chrome', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser']) expect(include).toContain(`Software\\${browser}\\NativeMessagingHosts\\app.auri.native_host`)
    expect(include).toContain('"$INSTDIR\\resources\\native-host\\AuriNativeHost.exe"')
  })
  it.each([
    { AURI_EXTENSION_CHROME_ID: 'agefiaohfielfgadiagemnflekbboblp' },
    { AURI_EXTENSION_BRAVE_ID: 'agefiaohfielfgadiagemnflekbboblp' },
    { AURI_EXTENSION_EDGE_ID: 'kldacocmhefloboachmkpeojenaaocek' },
    { AURI_NATIVE_HOST_PACKAGING_MODE: 'test' }
  ])('falha fechado com configuração não oficial %j', (env) => {
    expect(() => loadProductionExtensionConfiguration(env)).toThrow()
  })
  it('versiona mantendo schema e ProtocolVersion e empacota arquivos gerados em path estável', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
    expect([pkg.version, lock.version, lock.packages[''].version]).toEqual(['1.14.0', '1.14.0', '1.14.0'])
    expect(pkg.dependencies['@auri/protocol']).toBe('github:Fish7w7/Auri-Protocol#v0.2.0')
    expect(lock.packages['node_modules/@auri/protocol']).toMatchObject({
      version: '0.2.0',
      resolved: 'git+ssh://git@github.com/Fish7w7/Auri-Protocol.git#d49202778bd1eedb8a24e944982a432c6c7c6d6b'
    })
    expect(pkg.build.extraResources).toContainEqual({ from: 'build/generated/browser-extension', to: 'browser-extension' })
    expect(pkg.build.beforePack).toBe('scripts/release/before-pack.cjs')
    expect(readFileSync('scripts/release/before-pack.cjs', 'utf8')).toContain('await prepareEmbedded()')
    expect(readFileSync('.gitignore', 'utf8')).toContain('/build/generated/')
  })
})
