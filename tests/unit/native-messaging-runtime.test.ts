import { PassThrough } from 'node:stream'
import { createRequest, createSuccessResponse, type ProtocolRequest, type ProtocolResponse } from '@auri/protocol'
import { describe, expect, it, vi } from 'vitest'
import { encodeLengthPrefixedJson, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'
import { NativeMessagingRuntime } from '../../src/native-host/native-messaging-runtime'
import type { NativeHostLog } from '../../src/native-host/host-logger'
import type { NativeHostTransport } from '../../src/native-host/desktop-connector'

const logger: NativeHostLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('NativeMessagingRuntime', () => {
  it('valida, encaminha concorrentemente e preserva id/method em respostas fora de ordem', async () => {
    const input = new PassThrough(); const output = new PassThrough(); const chunks: Buffer[] = []
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const waiting = new Map<string, (response: ProtocolResponse) => void>()
    const transport: NativeHostTransport = {
      forward: (request) => new Promise((resolve) => waiting.set(request.id, resolve)),
      close: vi.fn()
    }
    const runtime = new NativeMessagingRuntime(input, output, transport, logger); runtime.start()
    const first = helloRequest('first'); const second = helloRequest('second')
    input.write(Buffer.concat([encodeLengthPrefixedJson(first), encodeLengthPrefixedJson(second)]))
    await vi.waitFor(() => expect(waiting.size).toBe(2))
    waiting.get('second')!(helloResponse('second', ['desktop.future.capability']))
    waiting.get('first')!(helloResponse('first'))
    await vi.waitFor(() => expect(decodeAll(chunks)).toHaveLength(2))
    expect(decodeAll(chunks).map((response) => ({ id: response.id, method: response.method }))).toEqual([
      { id: 'second', method: 'system.hello' },
      { id: 'first', method: 'system.hello' }
    ])
    expect(decodeAll(chunks)[0]).toMatchObject({ ok: true, result: { capabilities: ['desktop.future.capability'] } })
    input.end()
    await vi.waitFor(() => expect(transport.close).toHaveBeenCalledOnce())
  })

  it('não encaminha request inválido e devolve erro de protocolo correlacionável', async () => {
    const input = new PassThrough(); const output = new PassThrough(); const chunks: Buffer[] = []
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const transport: NativeHostTransport = { forward: vi.fn(), close: vi.fn() }
    new NativeMessagingRuntime(input, output, transport, logger).start()
    input.write(encodeLengthPrefixedJson({ id: 'bad', protocolVersion: 1, method: 'work.open', params: {} }))
    await vi.waitFor(() => expect(chunks.length).toBeGreaterThan(0))
    expect(transport.forward).not.toHaveBeenCalled()
    expect(decodeAll(chunks)[0]).toMatchObject({ id: 'bad', method: 'work.open', ok: false, error: { code: 'INVALID_PARAMS' } })
    input.end()
  })

  it('encerra sem escrever dados não enquadrados quando o frame é inválido', async () => {
    const input = new PassThrough(); const output = new PassThrough(); const chunks: Buffer[] = []
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const transport: NativeHostTransport = { forward: vi.fn(), close: vi.fn() }
    new NativeMessagingRuntime(input, output, transport, logger).start()
    input.write(Buffer.alloc(4))
    await vi.waitFor(() => expect(transport.close).toHaveBeenCalledOnce())
    expect(Buffer.concat(chunks)).toHaveLength(0)
  })
})

function helloRequest(id: string): ProtocolRequest {
  return createRequest(id, 'system.hello', {
    client: { kind: 'native-host', name: 'test-host', version: '1.10.0' }, supportedProtocolVersions: [1]
  })
}

function helloResponse(id: string, capabilities: string[] = []): ProtocolResponse {
  return createSuccessResponse(id, 'system.hello', {
    protocolVersion: 1, server: { kind: 'desktop', name: 'auri-desktop', version: '1.10.0' }, capabilities
  })
}

function decodeAll(chunks: Buffer[]): ProtocolResponse[] {
  const decoder = new LengthPrefixedJsonDecoder()
  return decoder.push(Buffer.concat(chunks)) as ProtocolResponse[]
}
