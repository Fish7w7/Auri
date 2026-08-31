import { createRequest, PROTOCOL_VERSION } from '@auri/protocol'
import { describe, expect, it } from 'vitest'
import { DomainError } from '@shared/errors/domain-error'
import { DESKTOP_PROTOCOL_FEATURES, ProtocolDispatcher, type ProtocolFeatureCapability, type ProtocolHandlerMap } from '@main/protocol/protocol-dispatcher'
import { TestLogger } from '../helpers/test-logger'

function dispatcher(handlers: ProtocolHandlerMap, features: readonly ProtocolFeatureCapability[] = []) {
  return new ProtocolDispatcher(handlers, new TestLogger(), features)
}

describe('ProtocolDispatcher', () => {
  it('responde hello e deriva capabilities dos handlers registrados', async () => {
    let instance!: ProtocolDispatcher
    instance = dispatcher({
      'system.hello': () => ({ protocolVersion: PROTOCOL_VERSION, server: { kind: 'desktop', name: 'auri-desktop', version: '1.10.0' }, capabilities: instance.capabilities }),
      'work.resolve': () => ({ status: 'not_found' }),
      'work.open': () => ({ opened: true }),
      'desktop.openAddWork': () => ({ opened: true })
    }, DESKTOP_PROTOCOL_FEATURES)
    const response = await instance.dispatch(createRequest('hello', 'system.hello', { client: { kind: 'native-host', name: 'test-host', version: '0.1.0' }, supportedProtocolVersions: [1] }))
    expect(response).toMatchObject({ ok: true, result: { server: { version: '1.10.0' }, capabilities: ['work.resolve', 'work.open', 'desktop.openAddWork', 'desktop.openAddWork.coverUrl'] } })
    expect(dispatcher({}, DESKTOP_PROTOCOL_FEATURES).capabilities).not.toContain('desktop.openAddWork.coverUrl')
  })

  it('trata handler ausente, params inválidos, falha de domínio e erro inesperado', async () => {
    const instance = dispatcher({
      'work.open': () => { throw new DomainError('WORK_NOT_FOUND', 'interno') },
      'work.resolve': () => { throw new Error('segredo interno') }
    })
    await expect(instance.dispatch(createRequest('missing', 'source.add', { workId: crypto.randomUUID(), url: 'https://example.com' }))).resolves.toMatchObject({ ok: false, error: { code: 'METHOD_NOT_SUPPORTED' } })
    await expect(instance.dispatch({ kind: 'request', protocolVersion: 1, id: 'invalid', method: 'work.open', params: {} })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
    await expect(instance.dispatch(createRequest('domain', 'work.open', { workId: crypto.randomUUID() }))).resolves.toMatchObject({ ok: false, error: { code: 'WORK_NOT_FOUND', message: 'Obra não encontrada.' } })
    const unexpected = await instance.dispatch(createRequest('unexpected', 'work.resolve', { url: 'https://example.com' }))
    expect(unexpected).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(unexpected)).not.toContain('segredo interno')
  })
})
