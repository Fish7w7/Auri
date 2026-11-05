import { randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRequest, type ProtocolRequest, type ProtocolResponse } from '@auri/protocol'
import { resolveBridgeEndpoint } from '@main/bridge/bridge-identity'
import { NamedPipeBridgeServer } from '@main/bridge/named-pipe-server'
import { ProtocolDispatcher } from '@main/protocol/protocol-dispatcher'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import { assertE2EPrivateFile } from '../../src/native-host/e2e-configuration'
import { TestLogger } from '../fixtures/test-logger'

// Each case owns a fresh project root, profile, secret, pipe and log baseline.
// It never reuses the preserved project profile or registers anything in Windows.
async function createFixture() {
  const root = resolve('artifacts/native-messaging-e2e/fixtures/process-' + randomUUID())
  const profile = join(root, 'artifacts/e2e-profiles/auritest-01')
  const directory = join(root, 'artifacts/native-host/e2e')
  const executable = join(directory, 'AuriNativeHostE2E.exe')
  const configPath = join(directory, 'e2e-config.json'), secretPath = join(profile, 'native-bridge/secret')
  const logPath = join(profile, 'logs/native-host-e2e.log'), unusedAppData = join(root, 'must-never-be-created')
  const origin = 'chrome-extension://' + 'a'.repeat(32) + '/', secret = randomBytes(32)
  const configuration = { version: 1, projectRoot: root, userDataPath: profile, extensionId: 'a'.repeat(32) }
  const requested = process.env.AURI_E2E_TEST_HOST_BINARY
  const source = requested ? resolve(requested) : resolve('artifacts/native-host/e2e/AuriNativeHostE2E.exe')
  if (requested) {
    const suffix = relative(resolve('artifacts/native-host/candidates'), source)
    if (!suffix || suffix.startsWith('..' + sep) || suffix === '..' || isAbsolute(suffix) || basename(source) !== 'AuriNativeHostE2E.exe') throw new Error('Test binary must be an explicit E2E candidate')
  }
  assertE2EPrivateFile(source)
  mkdirSync(directory, { recursive: true }); mkdirSync(dirname(secretPath), { recursive: true })
  copyFileSync(source, executable)
  writeFileSync(configPath, JSON.stringify(configuration), { flag: 'wx' })
  writeFileSync(secretPath, secret.toString('base64'), { flag: 'wx' })
  let dispatcher!: ProtocolDispatcher
  dispatcher = new ProtocolDispatcher({
    'system.hello': () => ({ protocolVersion: 1, server: { kind: 'desktop', name: 'auri-desktop', version: '1.14.0' }, capabilities: dispatcher.capabilities }),
    'work.resolve': () => ({ status: 'not_found' })
  }, new TestLogger())
  const server = new NamedPipeBridgeServer(resolveBridgeEndpoint(profile, false), secret, dispatcher, new TestLogger(), { handshakeMs: 1000, requestMs: 1000, idleMs: 5000 })
  await server.start()
  return { root, profile, executable, configPath, secretPath, logPath, unusedAppData, origin, secret, configuration, server }
}
let fixture: Awaited<ReturnType<typeof createFixture>> | undefined
beforeEach(async () => { fixture = await createFixture() })
afterEach(() => { fixture?.server.close(); fixture = undefined })
const hello = createRequest('e2e-binary-hello', 'system.hello', { client: { kind: 'native-host', name: 'process-infra-test', version: '1.14.0' }, supportedProtocolVersions: [1] })

async function exchange(f: NonNullable<typeof fixture>, requests: ProtocolRequest[], requestedOrigin = f.origin) {
  return new Promise<{ code: number | null; responses: ProtocolResponse[]; stderr: string; outputBytes: number; partial: boolean }>((done, reject) => {
    const child = spawn(f.executable, [requestedOrigin], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, APPDATA: f.unusedAppData, AURI_NATIVE_HOST_MODE: 'prod', AURI_E2E_USER_DATA: join(f.root, 'wrong-env-profile') }
    })
    const responses: ProtocolResponse[] = [], decoder = new LengthPrefixedJsonDecoder()
    let stderr = '', outputBytes = 0
    const timer = setTimeout(() => { child.kill(); reject(new Error('E2E host process timeout')) }, 10000)
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.stdin.on('error', () => undefined)
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length
      try { responses.push(...decoder.push(chunk) as ProtocolResponse[]) }
      catch (error) { child.kill(); clearTimeout(timer); reject(error) }
      if (responses.length >= requests.length) child.stdin.end()
    })
    child.on('close', code => { clearTimeout(timer); done({ code, responses, stderr, outputBytes, partial: decoder.hasPartialFrame }) })
    if (requests.length) for (const request of requests) child.stdin.write(encodeLengthPrefixedJson(request))
    else child.stdin.end()
  })
}

describe('AuriNativeHostE2E.exe: processo real sem registro', () => {
  it('usa configuração adjacente em vez de APPDATA/env e troca frames autenticados até EOF', async () => {
    const f = fixture!, result = await exchange(f, [hello, createRequest('e2e-resolve', 'work.resolve', { url: 'https://synthetic.example.test/e2e-fixture' })])
    expect(result.code, result.stderr).toBe(0); expect(result.partial).toBe(false)
    expect(result.responses).toMatchObject([
      { id: 'e2e-binary-hello', ok: true, result: { protocolVersion: 1, server: { version: '1.14.0' } } },
      { id: 'e2e-resolve', ok: true, result: { status: 'not_found' } }
    ])
    expect(existsSync(f.unusedAppData)).toBe(false)
    const logs = readFileSync(f.logPath, 'utf8')
    expect(logs).toContain('native_host.pipe_connected'); expect(logs).not.toContain(f.secret.toString('base64'))
    expect(result.stderr).not.toContain(f.secret.toString('base64'))
  }, 15000)
  it('secret divergente é recusado pelo HMAC existente e não vira sucesso', async () => {
    const f = fixture!; writeFileSync(f.secretPath, randomBytes(32).toString('base64'))
    const result = await exchange(f, [hello])
    expect(result.code, result.stderr).toBe(0); expect(result.responses).toMatchObject([{ ok: false, error: { code: 'AURI_NOT_READY' } }])
    expect(existsSync(f.unusedAppData)).toBe(false)
  }, 15000)
  it('Desktop ausente retorna indisponível sem autostart nem fallback', async () => {
    const f = fixture!; f.server.close()
    const result = await exchange(f, [hello])
    expect(result.code, result.stderr).toBe(0); expect(result.responses).toMatchObject([{ ok: false, error: { code: 'AURI_NOT_READY' } }])
    expect(result.stderr).not.toContain('desktop_start_requested'); expect(existsSync(f.unusedAppData)).toBe(false)
  }, 15000)
  it('configuração ausente termina antes de logs, mesmo com env sugerindo PROD', async () => {
    const f = fixture!; expect(existsSync(f.logPath)).toBe(false); renameSync(f.configPath, f.configPath + '.saved')
    const result = await exchange(f, [])
    expect(result.code).toBe(1); expect(result.outputBytes).toBe(0); expect(result.stderr).toContain('AURI_NATIVE_HOST_E2E_CONFIGURATION_REJECTED')
    expect(existsSync(f.logPath)).toBe(false); expect(existsSync(f.unusedAppData)).toBe(false)
  }, 15000)
  it('perfil inválido é recusado pelo binário antes de criar logs externos', async () => {
    const f = fixture!; expect(existsSync(f.logPath)).toBe(false)
    writeFileSync(f.configPath, JSON.stringify({ ...f.configuration, userDataPath: join(f.root, 'Auri') }))
    const result = await exchange(f, [])
    expect(result.code).toBe(1); expect(result.outputBytes).toBe(0)
    expect(existsSync(f.logPath)).toBe(false); expect(existsSync(join(f.root, 'Auri'))).toBe(false); expect(existsSync(f.unusedAppData)).toBe(false)
  }, 15000)
  it('origin diferente é recusada antes de logs ou conexão', async () => {
    const f = fixture!; expect(existsSync(f.logPath)).toBe(false)
    const result = await exchange(f, [], 'chrome-extension://' + 'b'.repeat(32) + '/')
    expect(result.code).toBe(1); expect(result.outputBytes).toBe(0); expect(existsSync(f.logPath)).toBe(false)
  }, 15000)
  it('rejeição de configuração preserva baseline de log explicitamente preparado neste caso', async () => {
    const f = fixture!; mkdirSync(dirname(f.logPath)); writeFileSync(f.logPath, 'synthetic log baseline\n', { flag: 'wx' })
    renameSync(f.configPath, f.configPath + '.saved'); const result = await exchange(f, [])
    expect(result.code).toBe(1); expect(readFileSync(f.logPath, 'utf8')).toBe('synthetic log baseline\n')
  }, 15000)
})