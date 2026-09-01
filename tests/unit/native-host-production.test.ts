import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BRAVE_PROD_REGISTRY_KEY,
  CHROME_PROD_REGISTRY_KEY,
  EDGE_PROD_REGISTRY_KEY,
  PROD_NATIVE_HOST_NAME,
  createProductionHostManifest,
  createProductionInstallerInclude,
  installProductionRegistrations,
  loadProductionExtensionConfiguration,
  prepareProductionPackaging,
  uninstallProductionRegistrations,
  validateProductionExtensionId,
  type ProductionNativeHostConfig,
  type ProductionRegistryAdapter
} from '../../scripts/native-host-production.js'

const CHROME_ID = 'a'.repeat(32)
const EDGE_ID = 'b'.repeat(32)
const BRAVE_ID = 'c'.repeat(32)
const CONFIG: ProductionNativeHostConfig = {
  extensionIdEnvironmentVariables: { chrome: 'CHROME_ID', edge: 'EDGE_ID', brave: 'BRAVE_ID' }
}
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('empacotamento do Native Host PROD', () => {
  it.each([
    ['um ID', { CHROME_ID }, [CHROME_ID]],
    ['Chrome + Edge', { CHROME_ID, EDGE_ID }, [CHROME_ID, EDGE_ID]],
    ['Chrome + Brave', { CHROME_ID, BRAVE_ID }, [CHROME_ID, BRAVE_ID]],
    ['três IDs', { CHROME_ID, EDGE_ID, BRAVE_ID }, [CHROME_ID, EDGE_ID, BRAVE_ID]],
    ['ID duplicado', { CHROME_ID, EDGE_ID: CHROME_ID }, [CHROME_ID]]
  ])('gera allowed_origins para %s', (_label, environment, expectedIds) => {
    const result = loadProductionExtensionConfiguration(environment, CONFIG)
    expect(result.extensionIds).toEqual(expectedIds)
    expect(result.allowedOrigins).toEqual(expectedIds.map((id) => `chrome-extension://${id}/`))
  })

  it('falha fechado sem IDs no release e recusa IDs/origins inválidos', () => {
    expect(() => loadProductionExtensionConfiguration({}, CONFIG)).toThrow('IDs de produção da Auri Extension não configurados.')
    expect(() => loadProductionExtensionConfiguration({ AURI_NATIVE_HOST_PACKAGING_MODE: 'test' }, CONFIG)).toThrow(/modo de teste exige/)
    for (const invalid of ['*', 'abc', 'q'.repeat(32), `${'a'.repeat(31)}1`]) expect(() => validateProductionExtensionId(invalid)).toThrow(/inválido/)
    expect(() => createProductionInstallerInclude(['*'])).toThrow(/Origin inválida/)
  })

  it('gera JSON válido com path Windows absoluto e sem wildcard', () => {
    const executablePath = 'C:\\Users\\Auri\\AppData\\Local\\Programs\\Auri\\resources\\native-host\\AuriNativeHost.exe'
    const manifest = createProductionHostManifest(executablePath, [CHROME_ID, EDGE_ID, CHROME_ID])
    const parsed = JSON.parse(JSON.stringify(manifest)) as typeof manifest
    expect(parsed).toEqual({
      name: PROD_NATIVE_HOST_NAME,
      description: 'Auri Desktop Native Messaging Host',
      path: executablePath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${CHROME_ID}/`, `chrome-extension://${EDGE_ID}/`]
    })
    expect(JSON.stringify(parsed)).not.toContain('*')
    expect(() => createProductionHostManifest('resources\\native-host\\AuriNativeHost.exe', [CHROME_ID])).toThrow(/absoluto/)
  })

  it('prepara include NSIS somente em modo explícito e marca o pacote de teste', () => {
    const projectRoot = temporaryRoot()
    mkdirSync(join(projectRoot, 'artifacts', 'native-host'), { recursive: true })
    writeFileSync(join(projectRoot, 'artifacts', 'native-host', 'AuriNativeHost.exe'), 'fixture')
    const result = prepareProductionPackaging({
      projectRoot,
      config: CONFIG,
      environment: { AURI_NATIVE_HOST_PACKAGING_MODE: 'test', CHROME_ID }
    })
    const include = readFileSync(result.includePath, 'utf8')
    const metadata = JSON.parse(readFileSync(result.metadataPath, 'utf8')) as { mode: string; hostName: string; allowedOrigins: string[] }
    expect(metadata).toEqual({ mode: 'test', hostName: PROD_NATIVE_HOST_NAME, allowedOrigins: [`chrome-extension://${CHROME_ID}/`] })
    expect(include).toContain('AuriNativeHost.exe')
    expect(include).toContain(`chrome-extension://${CHROME_ID}/`)
    expect(include).not.toContain(`${PROD_NATIVE_HOST_NAME}.dev`)
    expect(() => prepareProductionPackaging({ projectRoot, config: CONFIG, environment: { AURI_NATIVE_HOST_PACKAGING_MODE: 'test', CHROME_ID }, requireRelease: true })).toThrow(/pipeline oficial exige/)
  })

  it('instala e atualiza Chrome, Edge e Brave sempre em HKCU', () => {
    const registry = memoryRegistry()
    const firstManifest = 'C:\\Users\\Auri\\AppData\\Local\\Programs\\Auri\\resources\\native-host\\app.auri.native_host.json'
    const updatedManifest = 'D:\\Apps\\Auri\\resources\\native-host\\app.auri.native_host.json'
    registry.values.set(CHROME_PROD_REGISTRY_KEY, firstManifest)
    installProductionRegistrations(registry, updatedManifest)
    expect([...registry.values.entries()]).toEqual([
      [CHROME_PROD_REGISTRY_KEY, updatedManifest],
      [EDGE_PROD_REGISTRY_KEY, updatedManifest],
      [BRAVE_PROD_REGISTRY_KEY, updatedManifest]
    ])
    expect([...registry.values.keys()].every((key) => key.startsWith('HKCU\\') && !key.includes('.dev'))).toBe(true)
  })

  it('uninstall remove só registros desta instalação e preserva DEV/terceiros', () => {
    const registry = memoryRegistry()
    const manifestPath = 'C:\\Auri\\resources\\native-host\\app.auri.native_host.json'
    const devKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\app.auri.native_host.dev'
    const thirdPartyKey = 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.example.host'
    registry.values.set(CHROME_PROD_REGISTRY_KEY, manifestPath)
    registry.values.set(EDGE_PROD_REGISTRY_KEY, 'C:\\Other\\app.auri.native_host.json')
    registry.values.set(BRAVE_PROD_REGISTRY_KEY, manifestPath.toLocaleUpperCase('en-US'))
    registry.values.set(devKey, 'C:\\Dev\\manifest.json')
    registry.values.set(thirdPartyKey, 'C:\\ThirdParty\\manifest.json')

    expect(uninstallProductionRegistrations(registry, manifestPath)).toEqual({ removed: ['Chrome', 'Brave'], skipped: ['Edge'] })
    expect(registry.values.get(EDGE_PROD_REGISTRY_KEY)).toBe('C:\\Other\\app.auri.native_host.json')
    expect(registry.values.get(devKey)).toBe('C:\\Dev\\manifest.json')
    expect(registry.values.get(thirdPartyKey)).toBe('C:\\ThirdParty\\manifest.json')
  })
})

function temporaryRoot(): string {
  const root = join(tmpdir(), `auri-native-prod-${randomUUID()}`); roots.push(root); mkdirSync(root, { recursive: true }); return root
}

function memoryRegistry(): ProductionRegistryAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    readDefault: vi.fn((key: string) => values.get(key) ?? null),
    setDefault: vi.fn((key: string, value: string) => { values.set(key, value) }),
    deleteKey: vi.fn((key: string) => { values.delete(key) })
  }
}
