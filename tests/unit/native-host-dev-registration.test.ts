import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHROME_DEV_REGISTRY_KEY,
  DEV_NATIVE_HOST_NAME,
  EDGE_DEV_REGISTRY_KEY,
  createDevHostManifest,
  createRegistryAdapter,
  parseRegisterArguments,
  registerDevelopmentHost,
  resolveDevIntegrationPaths,
  unregisterDevelopmentHost,
  validateExtensionId,
  type RegistryAdapter
} from '../../scripts/native-host-dev.js'

const CHROME_ID = 'a'.repeat(32)
const EDGE_ID = 'b'.repeat(32)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('manifest e Registry do Native Host DEV', () => {
  it('gera manifest DEV com path absoluto e somente origens explicitamente autorizadas', () => {
    const root = temporaryRoot(); const { executablePath } = resolveDevIntegrationPaths(root)
    const manifest = createDevHostManifest(executablePath, [CHROME_ID, EDGE_ID, CHROME_ID])
    expect(manifest).toEqual({
      name: DEV_NATIVE_HOST_NAME,
      description: 'Auri Native Host Development',
      path: executablePath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${CHROME_ID}/`, `chrome-extension://${EDGE_ID}/`]
    })
    expect(JSON.stringify(manifest)).not.toContain('*')
  })

  it('recusa IDs inválidos, wildcard e ausência de navegador', () => {
    for (const invalid of ['*', 'abc', 'q'.repeat(32), `${'a'.repeat(31)}1`]) expect(() => validateExtensionId(invalid)).toThrow(/inválido/)
    expect(() => parseRegisterArguments([])).toThrow(/Informe/)
    expect(() => parseRegisterArguments(['--chrome-extension-id=*'])).toThrow(/inválido/)
  })

  it('registra Chrome e Edge somente nas chaves HKCU com sufixo dev', () => {
    const root = temporaryRoot(); const paths = createDevExecutable(root); const registry = memoryRegistry()
    const result = registerDevelopmentHost({ projectRoot: root, chromeExtensionId: CHROME_ID, edgeExtensionId: EDGE_ID }, { registry })
    const manifest = JSON.parse(readFileSync(paths.manifestPath, 'utf8')) as { allowed_origins: string[] }
    expect(result.browsers).toEqual(['Chrome', 'Edge'])
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${CHROME_ID}/`, `chrome-extension://${EDGE_ID}/`])
    expect(registry.values.get(CHROME_DEV_REGISTRY_KEY)).toBe(paths.manifestPath)
    expect(registry.values.get(EDGE_DEV_REGISTRY_KEY)).toBe(paths.manifestPath)
    expect([...registry.values.keys()].every((key) => key.startsWith('HKCU\\') && key.endsWith(DEV_NATIVE_HOST_NAME))).toBe(true)
  })

  it('produz comandos controlados para consultar, registrar e remover Chrome/Edge', () => {
    const calls: string[][] = []
    const adapter = createRegistryAdapter((argumentsList) => {
      calls.push(argumentsList)
      return argumentsList[0] === 'query'
        ? { status: 1, stdout: '', stderr: '' }
        : { status: 0, stdout: '', stderr: '' }
    })
    expect(adapter.readDefault(CHROME_DEV_REGISTRY_KEY)).toBeNull()
    adapter.setDefault(CHROME_DEV_REGISTRY_KEY, 'C:\\manifest.json')
    adapter.deleteKey(EDGE_DEV_REGISTRY_KEY)
    expect(calls).toEqual([
      ['query', CHROME_DEV_REGISTRY_KEY, '/ve'],
      ['add', CHROME_DEV_REGISTRY_KEY, '/ve', '/t', 'REG_SZ', '/d', 'C:\\manifest.json', '/f'],
      ['delete', EDGE_DEV_REGISTRY_KEY, '/f']
    ])
  })

  it('unregister remove somente chaves que ainda apontam para o manifest deste projeto', () => {
    const root = temporaryRoot(); const paths = createDevExecutable(root); const registry = memoryRegistry()
    registry.values.set(CHROME_DEV_REGISTRY_KEY, paths.manifestPath)
    registry.values.set(EDGE_DEV_REGISTRY_KEY, 'C:\\outro-projeto\\manifest.json')
    const result = unregisterDevelopmentHost({ projectRoot: root }, { registry })
    expect(result.removed).toEqual(['Chrome'])
    expect(result.skipped).toEqual(['Edge'])
    expect(registry.values.has(CHROME_DEV_REGISTRY_KEY)).toBe(false)
    expect(registry.values.get(EDGE_DEV_REGISTRY_KEY)).toBe('C:\\outro-projeto\\manifest.json')
  })

  it('não sobrescreve registro DEV pertencente a outro projeto', () => {
    const root = temporaryRoot(); createDevExecutable(root); const registry = memoryRegistry()
    registry.values.set(CHROME_DEV_REGISTRY_KEY, 'C:\\outro-projeto\\manifest.json')
    expect(() => registerDevelopmentHost({ projectRoot: root, chromeExtensionId: CHROME_ID }, { registry })).toThrow(/Nenhuma chave foi alterada/)
    expect(registry.values.get(CHROME_DEV_REGISTRY_KEY)).toBe('C:\\outro-projeto\\manifest.json')
  })
})

function temporaryRoot(): string {
  const root = join(tmpdir(), `auri-native-dev-${randomUUID()}`); roots.push(root); mkdirSync(root, { recursive: true }); return root
}

function createDevExecutable(root: string) {
  const paths = resolveDevIntegrationPaths(root); mkdirSync(paths.directory, { recursive: true }); writeFileSync(paths.executablePath, 'fixture'); return paths
}

function memoryRegistry(): RegistryAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    readDefault: vi.fn((key: string) => values.get(key) ?? null),
    setDefault: vi.fn((key: string, value: string) => { values.set(key, value) }),
    deleteKey: vi.fn((key: string) => { values.delete(key) })
  }
}

