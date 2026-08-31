import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequest, createSuccessResponse, type ProtocolRequest } from '@auri/protocol'
import { createBridgeProof } from '@shared/native-bridge/authentication'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import { AuthenticatedPipeClient } from '../../src/native-host/pipe-client'

const servers: Server[] = []; const sockets: Socket[] = []; const clients: AuthenticatedPipeClient[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.close()
  for (const socket of sockets.splice(0)) socket.destroy()
  for (const server of servers.splice(0)) server.close()
})

describe('AuthenticatedPipeClient', () => {
  it('autentica por HMAC e correlaciona respostas fora de ordem na conexão persistente', async () => {
    const endpoint = `\\\\.\\pipe\\auri-native-client-${randomUUID()}`; const secret = randomBytes(32)
    const server = createServer((socket) => {
      sockets.push(socket); const decoder = new LengthPrefixedJsonDecoder(); const serverNonce = randomBytes(32).toString('base64'); let authenticated = false; const requests: ProtocolRequest[] = []
      socket.write(encodeLengthPrefixedJson({ type: 'challenge', nonce: serverNonce }))
      socket.on('data', (chunk) => {
        for (const value of decoder.push(chunk)) {
          if (!authenticated) {
            const auth = value as { clientNonce: string; proof: string }
            expect(auth.proof).toBe(createBridgeProof(secret, serverNonce, auth.clientNonce))
            authenticated = true; socket.write(encodeLengthPrefixedJson({ type: 'authenticated' })); continue
          }
          requests.push(value as ProtocolRequest)
          if (requests.length === 2) {
            for (const request of [...requests].reverse()) socket.write(encodeLengthPrefixedJson(helloResponse(request.id)))
          }
        }
      })
    }); servers.push(server); await listen(server, endpoint)
    const client = await new AuthenticatedPipeClient(endpoint, secret, { connectMs: 500, handshakeMs: 500, requestMs: 500 }).open(); clients.push(client)
    const first = client.forward(helloRequest('first')); const second = client.forward(helloRequest('second'))
    await expect(Promise.all([first, second])).resolves.toMatchObject([{ id: 'first', method: 'system.hello' }, { id: 'second', method: 'system.hello' }])
  })

  it('recusa autenticação inválida sem manter o pipe aberto', async () => {
    const endpoint = `\\\\.\\pipe\\auri-native-auth-${randomUUID()}`; const secret = randomBytes(32)
    const server = createServer((socket) => {
      sockets.push(socket); const decoder = new LengthPrefixedJsonDecoder(); socket.write(encodeLengthPrefixedJson({ type: 'challenge', nonce: randomBytes(32).toString('base64') }))
      socket.on('data', (chunk) => { if (decoder.push(chunk).length) socket.end(encodeLengthPrefixedJson({ type: 'authentication_error' })) })
    }); servers.push(server); await listen(server, endpoint)
    await expect(new AuthenticatedPipeClient(endpoint, secret, { connectMs: 500, handshakeMs: 500, requestMs: 500 }).open()).rejects.toThrow(/Autenticação local recusada/)
  })
})

function helloRequest(id: string) {
  return createRequest(id, 'system.hello', { client: { kind: 'native-host', name: 'test', version: '1.10.0' }, supportedProtocolVersions: [1] })
}
function helloResponse(id: string) {
  return createSuccessResponse(id, 'system.hello', { protocolVersion: 1, server: { kind: 'desktop', name: 'auri-desktop', version: '1.10.0' }, capabilities: [] })
}
function listen(server: Server, endpoint: string): Promise<void> { return new Promise((resolve) => server.listen(endpoint, resolve)) }

