import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@auri/protocol'
import { WorkResolutionRepository } from '@main/database/repositories/work-resolution-repository'
import { WorkResolutionService } from '@main/services/work-resolution-service'
import { createProtocolHandlers } from '@main/protocol/protocol-handlers'
import { DESKTOP_PROTOCOL_FEATURES, ProtocolDispatcher } from '@main/protocol/protocol-dispatcher'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'
import { TestLogger } from '../fixtures/test-logger'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })

function setup() {
  const fixture = createDomainFixture(); fixtures.push(fixture)
  const desktop = { openWork: vi.fn(), openAddWork: vi.fn(), notifyWorkChanged: vi.fn() }
  let dispatcher!: ProtocolDispatcher
  dispatcher = new ProtocolDispatcher(createProtocolHandlers({
    appVersion: '1.10.0', resolution: new WorkResolutionService(new WorkResolutionRepository(fixture.db)),
    works: fixture.services.works, sources: fixture.services.sources, progress: fixture.services.progress,
    desktop: desktop as never
  }, () => dispatcher.capabilities), new TestLogger(), DESKTOP_PROTOCOL_FEATURES)
  return { fixture, desktop, dispatcher }
}

describe('handlers do Desktop Bridge', () => {
  it('system.hello anuncia suporte a coverUrl no Protocol 1', async () => {
    const { dispatcher } = setup()
    await expect(dispatcher.dispatch(createRequest('hello', 'system.hello', {
      client: { kind: 'native-host', name: 'auri-native-host', version: '1.10.0' },
      supportedProtocolVersions: [1]
    }))).resolves.toMatchObject({
      ok: true,
      result: { protocolVersion: 1, capabilities: expect.arrayContaining(['desktop.openAddWork', 'desktop.openAddWork.coverUrl']) }
    })
  })

  it('work.open valida a obra e comanda a janela', async () => {
    const { fixture, desktop, dispatcher } = setup(); const work = createMinimalWork(fixture)
    await expect(dispatcher.dispatch(createRequest('open', 'work.open', { workId: work.id }))).resolves.toMatchObject({ ok: true, result: { opened: true } })
    expect(desktop.openWork).toHaveBeenCalledWith(work.id)
    await expect(dispatcher.dispatch(createRequest('missing', 'work.open', { workId: crypto.randomUUID() }))).resolves.toMatchObject({ ok: false, error: { code: 'WORK_NOT_FOUND' } })
  })

  it('desktop.openAddWork sem coverUrl preserva o draft anterior', async () => {
    const { fixture, desktop, dispatcher } = setup()
    const draft = { pageUrl: 'https://example.com/obra', title: 'Obra externa' }
    await expect(dispatcher.dispatch(createRequest('add', 'desktop.openAddWork', draft))).resolves.toMatchObject({ ok: true })
    expect(desktop.openAddWork).toHaveBeenCalledWith(draft)
    expect(desktop.openAddWork.mock.calls[0]?.[0]).not.toHaveProperty('coverUrl')
    expect(fixture.services.library.getSummary().total).toBe(0)
  })

  it('desktop.openAddWork encaminha coverUrl sem criar ou baixar a obra', async () => {
    const { fixture, desktop, dispatcher } = setup()
    const draft = { pageUrl: 'https://example.com/obra', title: 'Obra externa', coverUrl: 'https://cdn.example.com/capa.webp' }
    await expect(dispatcher.dispatch(createRequest('add-cover', 'desktop.openAddWork', draft))).resolves.toMatchObject({ ok: true })
    expect(desktop.openAddWork).toHaveBeenCalledWith(draft)
    expect(fixture.services.library.getSummary().total).toBe(0)
  })

  it('desktop.openAddWork recusa scheme inseguro na fronteira do Protocol', async () => {
    const { desktop, dispatcher } = setup()
    await expect(dispatcher.dispatch({
      kind: 'request', protocolVersion: 1, id: 'unsafe-cover', method: 'desktop.openAddWork',
      params: { pageUrl: 'https://example.com/obra', coverUrl: 'data:image/png;base64,abc' }
    })).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_PARAMS' } })
    expect(desktop.openAddWork).not.toHaveBeenCalled()
  })

  it('source.add usa o serviço, não prefere e preserva duplicidade/work inexistente', async () => {
    const { fixture, desktop, dispatcher } = setup(); const work = createMinimalWork(fixture)
    const request = createRequest('source', 'source.add', { workId: work.id, url: 'https://reader.example/series/a', name: 'Reader' })
    await expect(dispatcher.dispatch(request)).resolves.toMatchObject({ ok: true, result: { source: { isPreferred: false, domain: 'reader.example' } } })
    expect(desktop.notifyWorkChanged).toHaveBeenCalledWith({ workId: work.id, kind: 'source' })
    await expect(dispatcher.dispatch({ ...request, id: 'duplicate' })).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(dispatcher.dispatch(createRequest('missing', 'source.add', { workId: crypto.randomUUID(), url: 'https://reader.example/b' }))).resolves.toMatchObject({ ok: false, error: { code: 'WORK_NOT_FOUND' } })
    expect(desktop.notifyWorkChanged).toHaveBeenCalledTimes(1)
  })

  it('progress.update de obra sem progresso salva capítulo 44 e notifica o Renderer', async () => {
    const { fixture, desktop, dispatcher } = setup(); const work = createMinimalWork(fixture)
    await expect(dispatcher.dispatch(createRequest('chapter-44', 'progress.update', {
      workId: work.id, chapter: { value: '44', numericValue: 44 }
    }))).resolves.toMatchObject({ ok: true, result: { updated: true } })
    expect(fixture.services.progress.getProgress({ workId: work.id }).chapter?.label).toBe('44')
    expect(desktop.notifyWorkChanged).toHaveBeenCalledWith({ workId: work.id, kind: 'progress' })
  })

  it('progress.update associa Source explícita/URL e recusa regressão ou salto sem alterar', async () => {
    const { fixture, desktop, dispatcher } = setup(); const work = createMinimalWork(fixture, 'Obra', '10')
    const source = fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://reader.example/series/a' })
    await expect(dispatcher.dispatch(createRequest('normal', 'progress.update', { workId: work.id, chapter: { value: '11', numericValue: 11 }, sourceId: source.id }))).resolves.toMatchObject({ ok: true })
    expect(fixture.repositories.sources.findById(source.id)?.lastUsedAt).not.toBeNull()
    await expect(dispatcher.dispatch(createRequest('url', 'progress.update', { workId: work.id, chapter: { value: '12' }, pageUrl: 'https://reader.example/series/a/' }))).resolves.toMatchObject({ ok: true })
    await expect(dispatcher.dispatch(createRequest('regression', 'progress.update', { workId: work.id, chapter: { value: '2' } }))).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(dispatcher.dispatch(createRequest('jump', 'progress.update', { workId: work.id, chapter: { value: '100' } }))).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(fixture.services.progress.getProgress({ workId: work.id }).chapter?.label).toBe('12')
    expect(desktop.notifyWorkChanged).toHaveBeenCalledTimes(2)
    expect(desktop.notifyWorkChanged).toHaveBeenNthCalledWith(1, { workId: work.id, kind: 'progress' })
    expect(desktop.notifyWorkChanged).toHaveBeenNthCalledWith(2, { workId: work.id, kind: 'progress' })
  })
})
