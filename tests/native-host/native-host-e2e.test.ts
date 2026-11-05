import { generateKeyPairSync, randomBytes, randomUUID, createHash } from 'node:crypto'
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@auri/protocol'
import { resolveBridgeEndpoint } from '@main/bridge/bridge-identity'
import { DesktopConnector, readBridgeSecret } from '../../src/native-host/desktop-connector'
import { NativeHostLogger, type NativeHostLog } from '../../src/native-host/host-logger'
import { E2E_NATIVE_HOST_NAME, loadE2EHostConfiguration } from '../../src/native-host/e2e-configuration'
import { createE2EHostManifest, E2E_BRAVE_REGISTRY_KEY, planE2ERegistration, planE2ERemoval, prepareE2EIntegration } from '../../src/native-host/e2e-preparation'

const base = resolve('artifacts/native-messaging-e2e/fixtures')
const request = createRequest('e2e-hello', 'system.hello', { client: { kind: 'native-host', name: 'infra-test', version: '1.14.0' }, supportedProtocolVersions: [1] })
const silent: NativeHostLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
function fixture() {
  const root = join(base, 'unit-' + randomUUID())
  const profile = join(root, 'artifacts/e2e-profiles/auritest-01')
  const directory = join(root, 'artifacts/native-host/e2e')
  mkdirSync(join(profile, 'native-bridge'), { recursive: true }); mkdirSync(directory, { recursive: true })
  const secret = randomBytes(32); const secretPath = join(profile, 'native-bridge/secret')
  writeFileSync(secretPath, secret.toString('base64'))
  const configPath = join(directory, 'e2e-config.json')
  const config = { version: 1, projectRoot: root, userDataPath: profile, extensionId: 'a'.repeat(32) }
  const save = (overrides: Record<string, unknown> = {}) => writeFileSync(configPath, JSON.stringify({ ...config, ...overrides }))
  save(); return { root, profile, directory, secret, secretPath, configPath, config, save }
}

describe('Native Host E2E: configuração e isolamento', () => {
  it('resolve somente auritest-01 e exatamente o endpoint/secret do Desktop unpackaged', () => {
    const f = fixture(); const paths = loadE2EHostConfiguration(f.configPath)
    expect(paths.userDataPath).toBe(f.profile)
    expect(paths.endpoint).toBe(resolveBridgeEndpoint(f.profile, false))
    expect(paths.secretPath).toBe(f.secretPath)
    expect(readBridgeSecret(paths.secretPath)).toEqual(f.secret)
    expect(paths.logPath).toBe(join(f.profile, 'logs/native-host-e2e.log'))
    const connector = new DesktopConnector({ development: false, appDataPath: join(f.root, 'unused'), hostExecutable: join(f.directory, 'AuriNativeHostE2E.exe'), logger: silent, e2eConfigPath: f.configPath })
    expect(connector.endpoint).toBe(paths.endpoint)
    expect(connector.secretPath).toBe(paths.secretPath)
    expect(existsSync(join(f.root, 'unused'))).toBe(false)
  })

  it('ausência de configuração interrompe antes de logs, secret ou conexão', () => {
    const f = fixture(); renameSync(f.configPath, f.configPath + '.saved')
    expect(() => loadE2EHostConfiguration(f.configPath)).toThrow('CONFIG_INVALID')
    expect(() => new DesktopConnector({ development: false, appDataPath: join(f.root, 'unused'), hostExecutable: '', logger: silent, e2eConfigPath: f.configPath })).toThrow()
    expect(existsSync(join(f.profile, 'logs'))).toBe(false)
    expect(existsSync(join(f.root, 'unused'))).toBe(false)
  })

  it.each(['relative', 'outside', 'other-profile', 'nested', 'traversal'])('rejeita destino %s sem fallback', (kind) => {
    const f = fixture()
    const candidates: Record<string, string> = { relative: 'auritest-01', outside: join(f.root, 'Auri'),
      'other-profile': join(f.root, 'artifacts/e2e-profiles/auritest-02'), nested: join(f.profile, 'child'), traversal: f.profile + '/../../Auri-Dev' }
    f.save({ userDataPath: candidates[kind] })
    expect(() => loadE2EHostConfiguration(f.configPath)).toThrow()
    expect(existsSync(join(f.profile, 'logs'))).toBe(false)
  })

  it.each([
    { version: 2 }, { extensionId: '*' }, { extensionId: 'agefiaohfielfgadiagemnflekbboblp' },
    { extensionId: 'alnngjgmhiebpnjefjmhbhmhfpgoibnh' }, { extensionId: 'lfneneebngmiikddoddnlcgobfjkodpm' },
    { extensionId: undefined }, { unknown: true }
  ])('rejeita configuração incompleta, identidade reservada ou wildcard: %j', (override) => {
    const f = fixture(); f.save(override)
    expect(() => loadE2EHostConfiguration(f.configPath)).toThrow()
  })

  it('rejeita junction no perfil e em seu conteúdo antes de criar logs', () => {
    for (const nested of [false, true]) {
      const f = fixture(); const target = join(f.root, 'separate'); mkdirSync(target)
      if (!nested) { renameSync(f.profile, join(f.root, 'saved-profile')); symlinkSync(target, f.profile, 'junction') }
      else symlinkSync(target, join(f.profile, 'logs'), 'junction')
      expect(() => loadE2EHostConfiguration(f.configPath)).toThrow()
      expect(existsSync(join(target, 'native-host-e2e.log'))).toBe(false)
    }
  })

  it('rejeita configuração compartilhada por hard link ou diretório de configuração em junction', () => {
    const hard = fixture(); linkSync(hard.configPath, hard.configPath + '.linked')
    expect(() => loadE2EHostConfiguration(hard.configPath)).toThrow()
    const f = fixture(); const target = join(f.root, 'saved-host'); renameSync(f.directory, target); symlinkSync(target, f.directory, 'junction')
    expect(() => loadE2EHostConfiguration(f.configPath)).toThrow()
  })

  it('secret ausente nunca procura Auri/Auri-Dev e nunca inicia Desktop PROD, mesmo development=false', async () => {
    const f = fixture(); renameSync(f.secretPath, f.secretPath + '.saved')
    const startDesktop = vi.fn()
    const connector = new DesktopConnector({ development: false, appDataPath: join(f.root, 'unused'), hostExecutable: join(f.directory, 'AuriNativeHostE2E.exe'), logger: silent, e2eConfigPath: f.configPath, startDesktop })
    await expect(connector.forward(request)).rejects.toThrow('E2E')
    expect(startDesktop).not.toHaveBeenCalled()
    expect(existsSync(join(f.root, 'unused'))).toBe(false)
  })

  it('pipe indisponível também não autoriza autostart nem fallback', async () => {
    const f = fixture(); const startDesktop = vi.fn()
    const connector = new DesktopConnector({ development: false, appDataPath: join(f.root, 'unused'), hostExecutable: join(f.directory, 'AuriNativeHostE2E.exe'), logger: silent, e2eConfigPath: f.configPath, startDesktop, pipeTimeouts: { connectMs: 30 } })
    await expect(connector.forward(request)).rejects.toThrow()
    expect(startDesktop).not.toHaveBeenCalled(); connector.close()
  })

  it('revalida configuração antes de cada forward, incluindo identidade da extensão', async () => {
    const f = fixture()
    const connector = new DesktopConnector({ development: false, appDataPath: '', hostExecutable: '', logger: silent, e2eConfigPath: f.configPath })
    f.save({ extensionId: 'b'.repeat(32) })
    await expect(connector.forward(request)).rejects.toThrow('E2E')
  })

  it('logs ficam no perfil e são bloqueados após alteração insegura do perfil', () => {
    const f = fixture(); const paths = loadE2EHostConfiguration(f.configPath)
    const logger = new NativeHostLogger(paths.logPath, false, () => { loadE2EHostConfiguration(f.configPath) })
    logger.info('synthetic', { event: 'e2e.test' })
    const before = readFileSync(paths.logPath, 'utf8')
    const target = join(f.root, 'outside'); mkdirSync(target); symlinkSync(target, join(f.profile, 'unsafe'), 'junction')
    logger.info('blocked', { event: 'e2e.blocked' })
    expect(readFileSync(paths.logPath, 'utf8')).toBe(before)
    expect(before).not.toContain(f.secret.toString('base64'))
  })

  it('manifest permite somente origin exata, com executável E2E absoluto', () => {
    const f = fixture(); const paths = loadE2EHostConfiguration(f.configPath)
    expect(createE2EHostManifest(paths)).toEqual({ name: 'app.auri.native_host.e2e', description: 'Auri Native Host E2E (isolated)',
      path: join(f.directory, 'AuriNativeHostE2E.exe'), type: 'stdio', allowed_origins: ['chrome-extension://' + f.config.extensionId + '/'] })
    expect(() => createE2EHostManifest({ ...paths, origin: '*' })).toThrow()
  })
})

describe('planos puros de Registry E2E', () => {
  it('seleciona somente HKCU Brave .e2e e recusa qualquer chave já existente', () => {
    const f = fixture(); const manifestPath = join(f.directory, E2E_NATIVE_HOST_NAME + '.json')
    const plan = planE2ERegistration(manifestPath, null)
    expect(plan.key).toBe('HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\app.auri.native_host.e2e')
    expect(plan.key).toBe(E2E_BRAVE_REGISTRY_KEY)
    for (const value of [manifestPath, 'foreign-owner.json']) expect(() => planE2ERegistration(manifestPath, { defaultValue: value, valueNames: [''], subkeys: [] })).toThrow('nunca sobrescrever')
  })

  it('remoção exige propriedade, hash e chave intocada; nunca apaga registros alheios', () => {
    const f = fixture(); const manifestPath = join(f.directory, E2E_NATIVE_HOST_NAME + '.json')
    const hash = createHash('sha256').update('synthetic').digest('hex')
    const current = { defaultValue: manifestPath, valueNames: [''], subkeys: [] }
    const ownership = { version: 1 as const, key: E2E_BRAVE_REGISTRY_KEY, manifestPath, manifestSha256: hash, previouslyAbsent: true as const }
    expect(() => planE2ERemoval(manifestPath, hash, current)).toThrow('propriedade')
    expect(planE2ERemoval(manifestPath, hash, current, ownership)).toEqual({ operation: 'delete-owned-key', key: E2E_BRAVE_REGISTRY_KEY })
    for (const modified of [{ ...current, defaultValue: 'foreign' }, { ...current, valueNames: ['', 'foreign'] }, { ...current, subkeys: ['foreign'] }, null]) {
      expect(() => planE2ERemoval(manifestPath, hash, modified, ownership)).toThrow()
    }
    expect(() => planE2ERemoval(manifestPath, '0'.repeat(64), current, ownership)).toThrow()
    expect(() => planE2ERemoval(manifestPath, hash, current, { ...ownership, key: E2E_BRAVE_REGISTRY_KEY.replace('.e2e', '.dev') })).toThrow()
  })
})

describe('preparação de arquivos sem registro', () => {
  it('verifica bundle/manifest E2E, prepara somente arquivos próprios e não sobrescreve uma segunda vez', () => {
    const f = fixture(); renameSync(f.configPath, f.configPath + '.saved')
    writeFileSync(join(f.directory, 'AuriNativeHostE2E.exe'), 'synthetic executable fixture')
    const extensionRoot = join(f.root, 'extension'); const output = join(extensionRoot, 'artifacts/e2e-native')
    mkdirSync(output, { recursive: true }); mkdirSync(join(extensionRoot, 'config')); mkdirSync(join(extensionRoot, 'public'))
    writeFileSync(join(extensionRoot, 'package.json'), JSON.stringify({ name: 'auri-extension', version: '0.3.0' }))
    writeFileSync(join(extensionRoot, 'public/manifest.json'), JSON.stringify({ version: '0.3.0' }))
    const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    writeFileSync(join(extensionRoot, 'config/e2e-extension.json'), JSON.stringify({ publicKey }))
    const manifest = { manifest_version: 3, name: 'Auri Extension E2E', version: '0.3.0', version_name: '0.3.0 E2E', key: publicKey, permissions: ['activeTab', 'scripting', 'nativeMessaging'] }
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(output, 'popup.js'), 'const host = "app.auri.native_host.e2e"')
    const plan = prepareE2EIntegration(f.root, extensionRoot)
    expect(plan.state).toBe('PREPARED_ONLY_NOT_REGISTERED')
    expect(plan.registry.inspected).toBe(false)
    expect(plan.brave.opened).toBe(false)
    expect(plan.databasePath).toBe(join(f.profile, 'data/library.sqlite'))
    expect(plan.endpoint).toBe(resolveBridgeEndpoint(f.profile, false))
    const configText = readFileSync(f.configPath, 'utf8')
    expect(() => prepareE2EIntegration(f.root, extensionRoot)).toThrow('sem sobrescrever')
    expect(readFileSync(f.configPath, 'utf8')).toBe(configText)
  })
})

describe('versão E2E deriva estritamente do projeto e dos manifests', () => {
  function preparedExtension(version: unknown = '0.3.1', bundleVersion: unknown = version, sourceVersion: unknown = version) {
    const f = fixture(); renameSync(f.configPath, f.configPath + '.saved')
    writeFileSync(join(f.directory, 'AuriNativeHostE2E.exe'), 'synthetic executable fixture')
    const extension = join(f.root, 'extension'), output = join(extension, 'artifacts/e2e-native')
    mkdirSync(output, { recursive: true }); mkdirSync(join(extension, 'config')); mkdirSync(join(extension, 'public'))
    writeFileSync(join(extension, 'package.json'), JSON.stringify({ name: 'auri-extension', version }))
    writeFileSync(join(extension, 'public/manifest.json'), JSON.stringify({ manifest_version: 3, version: sourceVersion }))
    const publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    writeFileSync(join(extension, 'config/e2e-extension.json'), JSON.stringify({ publicKey }))
    const manifest = { manifest_version: 3, name: 'Auri Extension E2E', version: bundleVersion, version_name: String(bundleVersion) + ' E2E', key: publicKey, permissions: ['activeTab', 'scripting', 'nativeMessaging'] }
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(output, 'popup.js'), 'const host = "app.auri.native_host.e2e"')
    return { f, extension, output, manifest }
  }
  it('aceita 0.3.1 quando pacote, manifest fonte e bundle declaram exatamente a mesma versão', () => {
    const { f, extension } = preparedExtension()
    expect(prepareE2EIntegration(f.root, extension).state).toBe('PREPARED_ONLY_NOT_REGISTERED')
  })
  it.each(['v0.3.1', '0.03.1', ' 0.3.1', '0.3.1-beta', '65536.1', '0.0.0', 3, undefined])('recusa formato de versão %o antes de escrever configuração', version => {
    const { f, extension } = preparedExtension(version === undefined ? null : version)
    expect(() => prepareE2EIntegration(f.root, extension)).toThrow('Versão')
    expect(existsSync(f.configPath)).toBe(false)
  })
  it.each([['0.3.1', '0.3.10', '0.3.1'], ['0.3.1', '0.3.1', '0.3.0']])('não faz comparação frouxa entre pacote %s, bundle %s e fonte %s', (version, bundle, source) => {
    const { f, extension } = preparedExtension(version, bundle, source)
    expect(() => prepareE2EIntegration(f.root, extension)).toThrow(); expect(existsSync(f.configPath)).toBe(false)
  })
  it('outra versão nunca autoriza material com identidade oficial', () => {
    const { f, extension, output, manifest } = preparedExtension()
    // Public Embedded identity is intentionally rejected; no sibling checkout or private key required.
    const identity = { publicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuj41OhegyELPccM3lt3WhJ1mS0hIHp+K5eFtitl+pN7oLaz/m98lrU74iru5WPIh8A8kfGeey+FxC4CU4Htxc9+eKMc5hZZha6X5jR8j1tZ6YZE69ACJssDmMm3Bxf7H3KR22P4BxIHcr4XVmKadOMVvTyJt6PYJ1bbh+e/qWH2q/FpsHSatXYyKdaVAcwCChjjxhjwVrO6mcXud+tBihVEoZpWM2dKK7MpDdVxDRCiikbAI/WO/VWM0kMjWWZLd0hN5YLYNA4H3QvJZ/O/9ydx2tY0kjnlHzq5hG/b586GByFINHY98WLZIh130e3ALuyMrElG79W4yrAbnGyj5PQIDAQAB" }
    writeFileSync(join(extension, 'config/e2e-extension.json'), JSON.stringify(identity))
    writeFileSync(join(output, 'manifest.json'), JSON.stringify({ ...manifest, key: identity.publicKey }))
    expect(() => prepareE2EIntegration(f.root, extension)).toThrow('oficial/DEV'); expect(existsSync(f.configPath)).toBe(false)
  })
})