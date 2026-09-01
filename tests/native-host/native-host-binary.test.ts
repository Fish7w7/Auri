import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest, type ProtocolResponse } from '@auri/protocol'
import { resolveBridgeEndpoint, resolveBridgeSecretPath, resolveBridgeUserData } from '@shared/native-bridge/identity'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import { NamedPipeBridgeServer } from '@main/bridge/named-pipe-server'
import { ProtocolDispatcher } from '@main/protocol/protocol-dispatcher'
import { TestLogger } from '../fixtures/test-logger'

const roots: string[] = []; const servers: NamedPipeBridgeServer[] = []
afterEach(() => { for (const server of servers.splice(0)) server.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('AuriNativeHostDev.exe', () => {
  it('usa o bridge DEV fixado no build, troca um frame real e encerra no EOF', async () => {
    const appData = join(tmpdir(), `auri-native-binary-${randomUUID()}`); roots.push(appData)
    const userData = resolveBridgeUserData(appData, true); const secretPath = resolveBridgeSecretPath(userData); const secret = randomBytes(32)
    mkdirSync(join(userData, 'native-bridge'), { recursive: true }); writeFileSync(secretPath, secret.toString('base64'))
    let dispatcher!: ProtocolDispatcher
    dispatcher = new ProtocolDispatcher({
      'system.hello': () => ({ protocolVersion: 1, server: { kind: 'desktop', name: 'auri-desktop', version: '1.10.0' }, capabilities: dispatcher.capabilities })
    }, new TestLogger())
    const server = new NamedPipeBridgeServer(resolveBridgeEndpoint(userData, true), secret, dispatcher, new TestLogger(), { handshakeMs: 1_000, requestMs: 1_000, idleMs: 5_000 })
    servers.push(server); await server.start()

    const executable = join(process.cwd(), 'artifacts', 'native-host', 'dev', 'AuriNativeHostDev.exe')
    const child = spawn(executable, [], { env: { ...process.env, APPDATA: appData, AURI_NATIVE_HOST_MODE: 'prod' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const decoder = new LengthPrefixedJsonDecoder(); const responses: ProtocolResponse[] = []
    child.stdout.on('data', (chunk) => responses.push(...decoder.push(chunk) as ProtocolResponse[]))
    child.stdin.write(encodeLengthPrefixedJson(createRequest('binary-hello', 'system.hello', {
      client: { kind: 'native-host', name: 'binary-test', version: '1.10.0' }, supportedProtocolVersions: [1]
    })))
    await waitFor(() => responses.length === 1)
    expect(responses[0]).toMatchObject({ id: 'binary-hello', method: 'system.hello', ok: true, result: { protocolVersion: 1 } })
    expect(decoder.hasPartialFrame).toBe(false)
    child.stdin.end()
    const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve))
    expect(exitCode).toBe(0)
  }, 10_000)
})

async function waitFor(condition: () => boolean): Promise<void> {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > 5_000) throw new Error('Timeout aguardando resposta do executável.')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
