import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@auri/protocol'
import { WorkResolutionRepository } from '@main/database/repositories/work-resolution-repository'
import { WorkResolutionService } from '@main/services/work-resolution-service'
import { createProtocolHandlers } from '@main/protocol/protocol-handlers'
import { ProtocolDispatcher } from '@main/protocol/protocol-dispatcher'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'
import { TestLogger } from '../helpers/test-logger'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })

function setup() {
  const fixture = createDomainFixture(); fixtures.push(fixture)
  const desktop = { openWork: vi.fn(), openAddWork: vi.fn() }
  let dispatcher!: ProtocolDispatcher
  dispatcher = new ProtocolDispatcher(createProtocolHandlers({
    appVersion: '1.10.0', resolution: new WorkResolutionService(new WorkResolutionRepository(fixture.db)),
    works: fixture.services.works, sources: fixture.services.sources, progress: fixture.services.progress,
    desktop: desktop as never
  }, () => dispatcher.capabilities), new TestLogger())
  return { fixture, desktop, dispatcher }
}

describe('handlers do Desktop Bridge', () => {
  it('work.open valida a obra e comanda a janela', async () => {
    const { fixture, desktop, dispatcher } = setup(); const work = createMinimalWork(fixture)
    await expect(dispatcher.dispatch(createRequest('open', 'work.open', { workId: work.id }))).resolves.toMatchObject({ ok: true, result: { opened: true } })
    expect(desktop.openWork).toHaveBeenCalledWith(work.id)
    await expect(dispatcher.dispatch(createRequest('missing', 'work.open', { workId: crypto.randomUUID() }))).resolves.toMatchObject({ ok: false, error: { code: 'WORK_NOT_FOUND' } })
  })

  it('desktop.openAddWork apenas entrega o draft', async () => {
    const { fixture, desktop, dispatcher } = setup()
    const draft = { pageUrl: 'https://example.com/obra', title: 'Obra externa' }
    await expect(dispatcher.dispatch(createRequest('add', 'desktop.openAddWork', draft))).resolves.toMatchObject({ ok: true })
    expect(desktop.openAddWork).toHaveBeenCalledWith(draft)
    expect(fixture.services.library.getSummary().total).toBe(0)
  })

  it('source.add usa o serviço, não prefere e preserva duplicidade/work inexistente', async () => {
    const { fixture, dispatcher } = setup(); const work = createMinimalWork(fixture)
    const request = createRequest('source', 'source.add', { workId: work.id, url: 'https://reader.example/series/a', name: 'Reader' })
    await expect(dispatcher.dispatch(request)).resolves.toMatchObject({ ok: true, result: { source: { isPreferred: false, domain: 'reader.example' } } })
    await expect(dispatcher.dispatch({ ...request, id: 'duplicate' })).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(dispatcher.dispatch(createRequest('missing', 'source.add', { workId: crypto.randomUUID(), url: 'https://reader.example/b' }))).resolves.toMatchObject({ ok: false, error: { code: 'WORK_NOT_FOUND' } })
  })

  it('progress.update associa Source explícita/URL e recusa regressão ou salto sem alterar', async () => {
    const { fixture, dispatcher } = setup(); const work = createMinimalWork(fixture, 'Obra', '10')
    const source = fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://reader.example/series/a' })
    await expect(dispatcher.dispatch(createRequest('normal', 'progress.update', { workId: work.id, chapter: { value: '11', numericValue: 11 }, sourceId: source.id }))).resolves.toMatchObject({ ok: true })
    expect(fixture.repositories.sources.findById(source.id)?.lastUsedAt).not.toBeNull()
    await expect(dispatcher.dispatch(createRequest('url', 'progress.update', { workId: work.id, chapter: { value: '12' }, pageUrl: 'https://reader.example/series/a/' }))).resolves.toMatchObject({ ok: true })
    await expect(dispatcher.dispatch(createRequest('regression', 'progress.update', { workId: work.id, chapter: { value: '2' } }))).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(dispatcher.dispatch(createRequest('jump', 'progress.update', { workId: work.id, chapter: { value: '100' } }))).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(fixture.services.progress.getProgress({ workId: work.id }).chapter?.label).toBe('12')
  })
})
