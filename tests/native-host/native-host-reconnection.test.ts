import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer, type Server, type Socket } from 'node:net'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest, createSuccessResponse, safeParseResponse, type ProtocolRequest } from '@auri/protocol'
import { NamedPipeBridgeServer } from '@main/bridge/named-pipe-server'
import { ProtocolDispatcher, type ProtocolHandlerMap } from '@main/protocol/protocol-dispatcher'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import { DesktopConnector } from '../../src/native-host/desktop-connector'
import { AuthenticatedPipeClient, NativeHostRequestNotSentError } from '../../src/native-host/pipe-client'
import { NativeMessagingRuntime } from '../../src/native-host/native-messaging-runtime'
import { TestLogger } from '../fixtures/test-logger'
import { createDomainFixture } from '../fixtures/domain-fixture'

const servers: Array<NamedPipeBridgeServer | Server> = [], clients: AuthenticatedPipeClient[] = [], connectors: DesktopConnector[] = [], sockets: Socket[] = [], cleanups: Array<() => void> = []
afterEach(() => { vi.restoreAllMocks(); for (const c of connectors.splice(0)) c.close(); for (const c of clients.splice(0)) c.close(); for (const s of sockets.splice(0)) s.destroy(); for (const s of servers.splice(0)) s.close(); for (const f of cleanups.splice(0)) f() })
const log = { info() {}, warn() {}, error() {} }
const hello = (id: string) => createRequest(id, 'system.hello', { client: { kind: 'native-host', name: 'isolated-reconnection-test', version: '1.14.0' }, supportedProtocolVersions: [1] })
const helloResult = { protocolVersion: 1 as const, server: { kind: 'desktop' as const, name: 'auri-desktop', version: '1.14.0' }, capabilities: [] }
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function until(predicate: () => boolean) { for (let i = 0; i < 300; i++) { if (predicate()) return; await delay(5) } throw new Error('Isolated pipe test timeout') }
function current(c: DesktopConnector) { return (c as unknown as { client: AuthenticatedPipeClient | null }).client }
function socketOf(c: AuthenticatedPipeClient) { return (c as unknown as { socket: Socket | null }).socket! }
function assertSettled(c: AuthenticatedPipeClient) {
  const state = c as unknown as { pending: Map<string, unknown>; connectTimer?: unknown; handshakeTimer?: unknown; openReject: unknown; openResolve: unknown }
  expect(c.isUsable).toBe(false); expect(state.pending.size).toBe(0); expect(state.connectTimer).toBeUndefined(); expect(state.handshakeTimer).toBeUndefined(); expect(state.openReject).toBeNull(); expect(state.openResolve).toBeNull()
}
function makeConnector(e2e = true) {
  const root = resolve('artifacts/native-host-reconnect-20261104/fixtures', randomUUID()), profile = join(root, 'artifacts/e2e-profiles/auritest-01'), directory = join(root, 'artifacts/native-host/e2e'), secret = randomBytes(32)
  mkdirSync(directory, { recursive: true }); mkdirSync(join(profile, 'native-bridge'), { recursive: true })
  const configPath = join(directory, 'e2e-config.json'); writeFileSync(configPath, JSON.stringify({ version: 1, projectRoot: root, userDataPath: profile, extensionId: 'a'.repeat(32) }))
  const connector = new DesktopConnector({ development: true, appDataPath: join(root, 'ordinary-mode'), hostExecutable: join(directory, 'AuriNativeHostE2E.exe'), logger: log, ...(e2e ? { e2eConfigPath: configPath } : {}), pipeTimeouts: { connectMs: 400, handshakeMs: 400, requestMs: 1000 } })
  connectors.push(connector); mkdirSync(join(connector.userDataPath, 'native-bridge'), { recursive: true }); writeFileSync(connector.secretPath, secret.toString('base64'))
  return { connector, secret }
}
async function setup(handlers: ProtocolHandlerMap = {}, idleMs = 80, requestMs = 500, e2e = true) {
  const f = makeConnector(e2e), logger = new TestLogger(), dispatcher = new ProtocolDispatcher({ 'system.hello': () => helloResult, ...handlers }, logger)
  const server = new NamedPipeBridgeServer(f.connector.endpoint, f.secret, dispatcher, logger, { handshakeMs: 500, requestMs, idleMs }); servers.push(server); await server.start(); return { ...f, logger, server }
}

describe('reconexão compartilhada antes do primeiro envio', () => {
  it.each([true, false])('fecha por ociosidade e compartilha uma única nova autenticação; E2E=%s', async e2e => {
    let calls = 0; const { connector, logger } = await setup({ 'system.hello': () => { calls++; return helloResult } }, 70, 500, e2e)
    await connector.forward(hello('initial')); const old = current(connector)!; clients.push(old)
    await until(() => !old.isUsable); assertSettled(old); expect(current(connector)).toBeNull()
    const replies = await Promise.all([connector.forward(hello('new-a')), connector.forward(hello('new-b'))])
    expect(replies.map(r => r.id)).toEqual(['new-a', 'new-b']); replies.forEach(r => expect(safeParseResponse(r).success).toBe(true))
    expect(calls).toBe(3); expect(current(connector)).not.toBe(old)
    expect(logger.entries.filter(e => e.context?.event === 'bridge.authentication_succeeded')).toHaveLength(2)
  })

  it('corrida entre disponibilidade e envio reconecta somente se write não foi chamado', async () => {
    let calls = 0; const { connector } = await setup({ 'system.hello': () => { calls++; return helloResult } }, 1000)
    await connector.forward(hello('initial')); const old = current(connector)!, original = old.forward.bind(old)
    vi.spyOn(old, 'forward').mockImplementationOnce(request => { old.close(); return original(request) })
    const reply = await connector.forward(hello('not-sent-yet'))
    expect(reply.id).toBe('not-sent-yet'); expect(calls).toBe(2); expect(current(connector)).not.toBe(old)
  })

  it('close e resposta tardios da conexão antiga não invalidam nem satisfazem a nova', async () => {
    let hold = false, release!: () => void, entered = false
    const { connector } = await setup({ 'system.hello': async () => { if (hold) { entered = true; await new Promise<void>(r => { release = r }) } return helloResult } }, 80, 1000)
    await connector.forward(hello('reused-id')); const old = current(connector)!, oldSocket = socketOf(old)
    await until(() => !old.isUsable)
    hold = true; let finished = false; const pending = connector.forward(hello('reused-id')).then(r => { finished = true; return r })
    await until(() => entered); const fresh = current(connector)!
    oldSocket.emit('close'); oldSocket.emit('data', encodeLengthPrefixedJson(createSuccessResponse('reused-id', 'system.hello', helloResult)))
    await delay(10); expect(finished).toBe(false); expect(current(connector)).toBe(fresh); expect(fresh.isUsable).toBe(true)
    release(); expect((await pending).id).toBe('reused-id')
  })

  it('encerramento explícito rejeita operações pendentes e impede novo envio/reabertura', async () => {
    const releases: Array<() => void> = []; let entered = 0
    const { connector } = await setup({ 'system.hello': async () => { entered++; await new Promise<void>(r => releases.push(r)); return helloResult } }, 1000)
    const results = Promise.allSettled([connector.forward(hello('a')), connector.forward(hello('b'))])
    await until(() => entered === 1); const client = current(connector)!
    connector.close(); const values = await results; values.forEach(r => expect(r.status).toBe('rejected')); assertSettled(client)
    releases.splice(0).forEach(r => r()); await until(() => entered === 2); releases.splice(0).forEach(r => r())
    await expect(connector.forward(hello('after-shutdown'))).rejects.toThrow('encerrado')
  })
})

describe('falhas de ciclo de vida e handshake', () => {
  async function rawServer(action: (socket: Socket) => void) {
    const endpoint = '\\\\.\\pipe\\auri-lifecycle-' + randomUUID(), server = createServer(s => { sockets.push(s); action(s) }); servers.push(server); await new Promise<void>(r => server.listen(endpoint, r)); return endpoint
  }
  it.each(['remote-close', 'handshake-timeout', 'explicit-close'] as const)('liquida open e timers uma única vez: %s', async mode => {
    const endpoint = await rawServer(s => { if (mode === 'remote-close') s.destroy() }), closed = vi.fn()
    const client = new AuthenticatedPipeClient(endpoint, randomBytes(32), { connectMs: 100, handshakeMs: 30, requestMs: 100 }, closed); clients.push(client)
    const outcome = client.open().then(() => null, error => error)
    if (mode === 'explicit-close') { await until(() => sockets.length > 0); client.close() }
    expect(await outcome).toBeInstanceOf(Error); assertSettled(client); client.close(); expect(closed).toHaveBeenCalledOnce()
    await expect(client.forward(hello('unsent'))).rejects.toBeInstanceOf(NativeHostRequestNotSentError)
  })
  it('erro de socket fecha e invalida imediatamente o cliente autenticado', async () => {
    const { connector } = await setup({}, 1000); await connector.forward(hello('open'))
    const client = current(connector)!; socketOf(client).emit('error', new Error('synthetic transport fault'))
    assertSettled(client); expect(current(connector)).toBeNull()
    expect((await connector.forward(hello('fresh'))).ok).toBe(true)
  })
  it('close do connector cancela handshake compartilhado e não publica cliente depois de encerrar', async () => {
    const f = makeConnector(), raw = createServer(s => sockets.push(s)); servers.push(raw); await new Promise<void>(r => raw.listen(f.connector.endpoint, r))
    const results = Promise.allSettled([f.connector.forward(hello('one')), f.connector.forward(hello('two'))])
    await until(() => sockets.length > 0); f.connector.close()
    const outcomes = await results; expect(outcomes.every(r => r.status === 'rejected')).toBe(true)
    expect(current(f.connector)).toBeNull(); expect(sockets).toHaveLength(1)
  })
})

describe('entrega incerta com SQLite sintético e pipe real', () => {
  it.each(['server-closes', 'client-times-out'] as const)('commit antes da resposta perdida: %s; nunca reenvia e leitura recupera valor', async loss => {
    const domain = createDomainFixture(); cleanups.push(() => domain.db.close())
    const details = domain.services.details.createDetailed({ title: 'Synthetic reconnect ' + randomUUID(), mediaType: 'manga', userStatus: 'reading', chapter: '2', source: { seriesUrl: 'https://reconnect.example.test/book', isPreferred: true } })
    let writes = 0, release!: () => void
    const { connector } = await setup({
      'progress.update': async params => {
        writes++; domain.services.progress.updateProgressFromLinkedPage({ workId: params.workId, sourceId: params.sourceId, chapterLabel: params.chapter.value }, params.pageUrl ?? null)
        await new Promise<void>(r => { release = r }); return { updated: true }
      },
      'work.context': params => domain.services.workContext.getContext(params)
    }, 1000, loss === 'server-closes' ? 60 : 500)
    if (loss === 'client-times-out') (connector as unknown as { options: { pipeTimeouts: { requestMs: number } } }).options.pipeTimeouts.requestMs = 100
    const input = new PassThrough(), output = new PassThrough(), runtime = new NativeMessagingRuntime(input, output, connector, log), decoder = new LengthPrefixedJsonDecoder(), replies: unknown[] = []
    output.on('data', chunk => replies.push(...decoder.push(chunk))); runtime.start()
    const workId = details.work.id, sourceId = details.sources[0].id
    input.write(encodeLengthPrefixedJson(createRequest('one-write', 'progress.update', { workId, sourceId, chapter: { value: '3', numericValue: 3 }, pageUrl: 'https://reconnect.example.test/book/chapter-03' })))
    await until(() => replies.length === 1)
    const failure = safeParseResponse(replies[0]); expect(failure.success).toBe(true); expect(replies[0]).toMatchObject({ id: 'one-write', ok: false, error: { code: 'AURI_NOT_READY' } })
    expect(writes).toBe(1); expect(domain.services.progress.getProgress({ workId }).chapter).toBeDefined()
    release()
    input.write(encodeLengthPrefixedJson(createRequest('read-after-loss', 'work.context', { workId, page: { url: 'https://reconnect.example.test/book/chapter-03' } })))
    await until(() => replies.length === 2)
    expect(replies[1]).toMatchObject({ id: 'read-after-loss', ok: true, result: { work: { id: workId, progress: { value: '3', numericValue: 3 } } } })
    expect(writes).toBe(1)
    const history = domain.services.progress.listHistory({ workId }); expect(history).toHaveLength(2); expect(history.filter(h => h.eventType === 'progress_update')).toHaveLength(1)
    runtime.close(); input.end(); output.end(); expect(current(connector)).toBeNull()
  })
})
