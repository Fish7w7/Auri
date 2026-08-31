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
