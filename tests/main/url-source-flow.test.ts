import { afterEach, describe, expect, it } from 'vitest'
import { UrlMetadataService } from '@main/services/url-metadata/url-metadata-service'
import type { SafePageFetcher } from '@main/services/url-metadata/safe-page-fetcher'
import { DomainError } from '@shared/errors/domain-error'
import { TestLogger } from '../fixtures/test-logger'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

function pageFetcher(title: string, finalUrl: string): SafePageFetcher {
  return {
    fetch: async (requestedUrl: string) => ({
      requestedUrl,
      finalUrl,
      contentType: 'text/html',
      html: `<html><head><meta property="og:title" content="${title}"></head></html>`
    })
  } as SafePageFetcher
}

describe('fluxo de URL com obras e fontes existentes', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('deduplica a mesma análise, libera após erro e aceita retry', async () => {
    fixture = createDomainFixture()
    let calls = 0
    let rejectFirst!: (error: unknown) => void
    let firstAttempt = true
    const fetcher = {
      fetch: async (requestedUrl: string) => {
        calls += 1
        if (firstAttempt) return new Promise<never>((_resolve, reject) => { rejectFirst = reject })
        return { requestedUrl, finalUrl: requestedUrl, contentType: 'text/html', html: '<html><title>Recuperada</title></html>' }
      }
    } as SafePageFetcher
    const service = new UrlMetadataService(fetcher, fixture.repositories.works, fixture.repositories.sources, new TestLogger())

    const first = service.analyze({ url: 'https://reader.example/same' })
    const duplicate = service.analyze({ url: 'https://reader.example/same' })
    const firstFailure = expect(first).rejects.toMatchObject({ code: 'URL_FETCH_FAILED' })
    const duplicateFailure = expect(duplicate).rejects.toMatchObject({ code: 'URL_FETCH_FAILED' })
    expect(calls).toBe(1)
    firstAttempt = false
    rejectFirst(new DomainError('URL_FETCH_FAILED', 'offline', { offline: true }))
    await Promise.all([firstFailure, duplicateFailure])

    await expect(service.analyze({ url: 'https://reader.example/same' })).resolves.toMatchObject({ metadata: { title: 'Recuperada' } })
    expect(calls).toBe(2)
  })

  it('não bloqueia uma URL diferente enquanto a anterior perde relevância', async () => {
    fixture = createDomainFixture()
    let calls = 0
    let resolveOld!: (page: Awaited<ReturnType<SafePageFetcher['fetch']>>) => void
    const fetcher = {
      fetch: async (requestedUrl: string) => {
        calls += 1
        if (requestedUrl.endsWith('/old')) return new Promise((resolve) => { resolveOld = resolve })
        return { requestedUrl, finalUrl: requestedUrl, contentType: 'text/html', html: '<html><title>Nova URL</title></html>' }
      }
    } as SafePageFetcher
    const service = new UrlMetadataService(fetcher, fixture.repositories.works, fixture.repositories.sources, new TestLogger())

    const old = service.analyze({ url: 'https://reader.example/old' })
    await expect(service.analyze({ url: 'https://reader.example/new' })).resolves.toMatchObject({ metadata: { title: 'Nova URL' } })
    expect(calls).toBe(2)
    resolveOld({ requestedUrl: 'https://reader.example/old', finalUrl: 'https://reader.example/old', contentType: 'text/html', html: '<html><title>Antiga</title></html>' })
    await old
  })

  it('permite confirmar a nova URL como fonte de uma obra encontrada pelo título', async () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Nano Machine')
    const service = new UrlMetadataService(
      pageFetcher('Nano Machine', 'https://reader.example/series/nano-machine'),
      fixture.repositories.works,
      fixture.repositories.sources,
      new TestLogger()
    )

    const preview = await service.analyze({ url: 'https://reader.example/nano' })
    expect(preview.duplicate).toMatchObject({ kind: 'work', work: { id: work.id } })

    const source = fixture.services.sources.createSource({
      workId: work.id,
      name: 'Reader',
      seriesUrl: preview.metadata.finalUrl
    })
    expect(source).toMatchObject({ workId: work.id, domain: 'reader.example' })
    expect(fixture.repositories.sources.listByWork(work.id)).toHaveLength(1)
  })

  it('detecta URL equivalente e o SourceService impede criar a fonte duplicada', async () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Nano Machine')
    fixture.services.sources.createSource({
      workId: work.id,
      seriesUrl: 'https://reader.example/series/nano/?b=2&a=1#capitulo'
    })
    const service = new UrlMetadataService(
      pageFetcher('Outro título', 'https://READER.example/series/nano?a=1&b=2'),
      fixture.repositories.works,
      fixture.repositories.sources,
      new TestLogger()
    )

    const preview = await service.analyze({ url: 'https://reader.example/link' })
    expect(preview.duplicate).toMatchObject({ kind: 'source', work: { id: work.id } })
    expect(() => fixture!.services.sources.createSource({
      workId: work.id,
      seriesUrl: 'https://reader.example/series/nano?a=1&b=2'
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_SOURCE' }))
    expect(fixture.repositories.sources.listByWork(work.id)).toHaveLength(1)
  })
})
