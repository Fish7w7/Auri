import { afterEach, describe, expect, it } from 'vitest'
import { WorkResolutionRepository } from '@main/database/repositories/work-resolution-repository'
import { WorkResolutionService } from '@main/services/work-resolution-service'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })
function setup() { const fixture = createDomainFixture(); fixtures.push(fixture); return { fixture, resolution: new WorkResolutionService(new WorkResolutionRepository(fixture.db)) } }

describe('WorkResolutionService', () => {
  it('prioriza Source URL/canonical exata sem alterar status ou lastUsedAt', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture)
    const source = fixture.services.sources.createSource({ workId: work.id, name: 'Scan', seriesUrl: 'https://reader.example/series/nano', status: 'archived' })
    expect(resolution.resolve({ url: 'https://other.example/chapter', canonicalUrl: 'https://reader.example/series/nano/' })).toMatchObject({ status: 'matched', work: { id: work.id }, source: { id: source.id, status: 'archived' }, match: { matchedBy: 'source_url', confidence: 'exact' } })
    expect(fixture.repositories.sources.findById(source.id)).toMatchObject({ status: 'archived', lastUsedAt: null })
  })

  it('resolve páginas descendentes da Source no caso real da ToonLivre', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'A Transmissão do Super-Humano')
    const source = fixture.services.sources.createSource({
      workId: work.id,
      seriesUrl: 'https://toonlivre.net/a-transmissao-do-super-humano',
      status: 'unavailable'
    })
    for (const url of [
      'https://toonlivre.net/a-transmissao-do-super-humano/44',
      'https://toonlivre.net/a-transmissao-do-super-humano/44/2',
      'https://toonlivre.net/a-transmissao-do-super-humano/44?foo=bar#section'
    ]) {
      expect(resolution.resolve({ url })).toMatchObject({
        status: 'matched', work: { id: work.id }, source: { id: source.id, status: 'unavailable' },
        match: { matchedBy: 'source_url', confidence: 'high' }
      })
    }
    expect(fixture.repositories.sources.findById(source.id)).toMatchObject({ status: 'unavailable', lastUsedAt: null })
  })

  it('exige boundary, mesmo origin e pathname útil para ancestralidade', () => {
    const { fixture, resolution } = setup()
    const boundary = createMinimalWork(fixture, 'Boundary')
    fixture.services.sources.createSource({ workId: boundary.id, seriesUrl: 'https://example.com/obra/abc' })
    const host = createMinimalWork(fixture, 'Outro host')
    fixture.services.sources.createSource({ workId: host.id, seriesUrl: 'https://site-a.com/obra/abc' })
    const root = createMinimalWork(fixture, 'Raiz')
    fixture.services.sources.createSource({ workId: root.id, seriesUrl: 'https://root.example/' })

    expect(resolution.resolve({ url: 'https://example.com/obra/abcdef/44' })).toEqual({ status: 'not_found' })
    expect(resolution.resolve({ url: 'https://site-b.com/obra/abc/44' })).toEqual({ status: 'not_found' })
    expect(resolution.resolve({ url: 'https://root.example/qualquer-coisa/44' })).toEqual({ status: 'not_found' })
  })

  it('prefere a ancestral mais específica e mantém empate real como ambiguous', () => {
    const { fixture, resolution } = setup()
    const broadWork = createMinimalWork(fixture, 'Ampla')
    const broad = fixture.services.sources.createSource({ workId: broadWork.id, seriesUrl: 'https://reader.example/catalogo/nano' })
    const specificWork = createMinimalWork(fixture, 'Específica')
    fixture.repositories.sources.create({
      ...broad, id: crypto.randomUUID(), workId: specificWork.id,
      seriesUrl: 'https://reader.example/catalogo/nano/capitulos', isPreferred: false
    })
    expect(resolution.resolve({ url: 'https://reader.example/catalogo/nano/capitulos/44' })).toMatchObject({ status: 'matched', work: { id: specificWork.id } })

    const tiedWork = createMinimalWork(fixture, 'Empatada')
    fixture.repositories.sources.create({
      ...broad, id: crypto.randomUUID(), workId: tiedWork.id,
      seriesUrl: 'https://reader.example/catalogo/nano/capitulos', isPreferred: false
    })
    expect(resolution.resolve({ url: 'https://reader.example/catalogo/nano/capitulos/45' })).toMatchObject({
      status: 'ambiguous', candidates: expect.arrayContaining([
        expect.objectContaining({ work: expect.objectContaining({ id: specificWork.id }) }),
        expect.objectContaining({ work: expect.objectContaining({ id: tiedWork.id }) })
      ])
    })
  })

  it('resolve domínio+título forte, título exato e alias exato', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'Nano Machine')
    fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://reader.example/nano', status: 'unavailable' })
    fixture.services.details.createAlias({ workId: work.id, name: 'Nano Mashin', kind: 'alternative', source: 'user' })
    expect(resolution.resolve({ url: 'https://reader.example/chapter/2', title: 'Nano Machine' })).toMatchObject({ status: 'matched', match: { matchedBy: 'source_domain', confidence: 'high' } })
    expect(resolution.resolve({ url: 'https://elsewhere.example', title: 'Nano Machine' })).toMatchObject({ status: 'matched', match: { matchedBy: 'title', confidence: 'exact' } })
    expect(resolution.resolve({ url: 'https://elsewhere.example', title: 'Nano Mashin' })).toMatchObject({ status: 'matched', match: { matchedBy: 'alias', confidence: 'exact' } })
  })

  it('retorna ambiguous para candidatos plausíveis e not_found sem evidência', () => {
    const { fixture, resolution } = setup()
    createMinimalWork(fixture, 'A Lenda do Norte')
    createMinimalWork(fixture, 'A Lenda do Norte: Retorno')
    expect(resolution.resolve({ url: 'https://example.com', title: 'Lenda do Norte' })).toMatchObject({ status: 'ambiguous', candidates: expect.arrayContaining([expect.objectContaining({ match: { confidence: 'possible', matchedBy: 'title' } })]) })
    expect(resolution.resolve({ url: 'https://example.com', title: 'Obra inexistente' })).toEqual({ status: 'not_found' })
  })
})
