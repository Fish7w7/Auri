import { afterEach, describe, expect, it } from 'vitest'
import { UrlMetadataService } from '@main/services/url-metadata/url-metadata-service'
import type { SafePageFetcher } from '@main/services/url-metadata/safe-page-fetcher'
import { TestLogger } from '../helpers/test-logger'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

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
