import { randomBytes, randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@auri/protocol'
import { BridgeFrameDecoder, encodeBridgeFrame } from '@main/bridge/bridge-framing'
import { createBridgeProof, NamedPipeBridgeServer } from '@main/bridge/named-pipe-server'
import { ProtocolDispatcher } from '@main/protocol/protocol-dispatcher'
import { TestLogger } from '../fixtures/test-logger'

class Client {
  readonly socket: Socket
  private readonly decoder = new BridgeFrameDecoder()
  private readonly queued: unknown[] = []
  private waiters: Array<(value: unknown) => void> = []
  constructor(endpoint: string) {
    this.socket = createConnection(endpoint)
    this.socket.on('data', (chunk) => { for (const message of this.decoder.push(chunk)) { const waiter = this.waiters.shift(); if (waiter) waiter(message); else this.queued.push(message) } })
  }
  next(): Promise<unknown> { const value = this.queued.shift(); return value === undefined ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve(value) }
  send(value: unknown): void { this.socket.write(encodeBridgeFrame(value)) }
  close(): void { this.socket.destroy() }
}

const servers: NamedPipeBridgeServer[] = []; const clients: Client[] = []
afterEach(() => { for (const client of clients.splice(0)) client.close(); for (const server of servers.splice(0)) server.close() })

async function setup() {
  const endpoint = `\\\\.\\pipe\\auri-bridge-test-${randomUUID()}`; const secret = randomBytes(32)
  let dispatcher!: ProtocolDispatcher
  dispatcher = new ProtocolDispatcher({
    'system.hello': () => ({ protocolVersion: 1, server: { kind: 'desktop', name: 'auri-desktop', version: '1.10.0' }, capabilities: dispatcher.capabilities }),
    'work.resolve': () => ({ status: 'not_found' })
  }, new TestLogger())
  const server = new NamedPipeBridgeServer(endpoint, secret, dispatcher, new TestLogger(), { handshakeMs: 100, requestMs: 100, idleMs: 500 }); servers.push(server); await server.start()
  return { endpoint, secret }
}

async function authenticate(endpoint: string, secret: Buffer) {
  const client = new Client(endpoint); clients.push(client)
  const challenge = await client.next() as { nonce: string }
  const clientNonce = randomBytes(32).toString('base64')
  client.send({ type: 'authenticate', clientNonce, proof: createBridgeProof(secret, challenge.nonce, clientNonce) })
  expect(await client.next()).toEqual({ type: 'authenticated' })
  return { client, challenge }
}

describe('NamedPipeBridgeServer', () => {
  it('autentica, usa nonce novo e aceita múltiplos requests na conexão', async () => {
    const { endpoint, secret } = await setup(); const first = await authenticate(endpoint, secret)
    first.client.socket.write(Buffer.concat([
      encodeBridgeFrame(createRequest('hello', 'system.hello', { client: { kind: 'native-host', name: 'test', version: '0.1.0' }, supportedProtocolVersions: [1] })),
      encodeBridgeFrame(createRequest('resolve', 'work.resolve', { url: 'https://example.com' }))
    ]))
    expect(await first.client.next()).toMatchObject({ id: 'hello', ok: true })
    expect(await first.client.next()).toMatchObject({ id: 'resolve', ok: true, result: { status: 'not_found' } })
    const second = new Client(endpoint); clients.push(second); const secondChallenge = await second.next() as { nonce: string }
    expect(secondChallenge.nonce).not.toBe(first.challenge.nonce)
  })

  it('recusa HMAC inválido e encerra handshake ocioso por timeout', async () => {
    const { endpoint } = await setup(); const invalid = new Client(endpoint); clients.push(invalid)
    const challenge = await invalid.next() as { nonce: string }
    invalid.send({ type: 'authenticate', clientNonce: 'nonce', proof: createBridgeProof(randomBytes(32), challenge.nonce, 'nonce') })
    expect(await invalid.next()).toEqual({ type: 'authentication_error' })
    const idle = new Client(endpoint); clients.push(idle); await idle.next()
    await new Promise<void>((resolve) => idle.socket.once('close', () => resolve()))
    expect(idle.socket.destroyed).toBe(true)
  })
})
