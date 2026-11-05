import { afterEach, describe, expect, it } from 'vitest'
import { WorkResolutionRepository } from '@main/database/repositories/work-resolution-repository'
import { WorkResolutionService } from '@main/services/work-resolution-service'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })
function setup() { const fixture = createDomainFixture(); fixtures.push(fixture); return { fixture, resolution: new WorkResolutionService(new WorkResolutionRepository(fixture.db), fixture.services.sourceIdentity, fixture.services.workEquivalence) } }

describe('WorkResolutionService', () => {
  it('prioriza Source URL/canonical exata sem alterar status ou lastUsedAt', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture)
    const source = fixture.services.sources.createSource({ workId: work.id, name: 'Scan', seriesUrl: 'https://reader.example/series/nano', status: 'archived' })
    expect(resolution.resolve({ url: 'https://reader.example/series/nano/chapter', canonicalUrl: 'https://reader.example/series/nano/' })).toMatchObject({ status: 'matched', work: { id: work.id }, source: { id: source.id, status: 'archived' }, match: { matchedBy: 'source_url', confidence: 'exact' } })
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

  it('resolve capítulos 30, 37 e 134 para a mesma identidade no caso real', () => {
    const { fixture, resolution } = setup()
    const details = fixture.services.details.createDetailed({
      title: 'Retorno de 10.000x - Capítulo 30 | ToonLivre',
      mediaType: 'manhwa',
      userStatus: 'reading',
      chapter: '30',
      source: { seriesUrl: 'https://toonlivre.net/retorno-de-10-000x-irma-senior-por-favor-comporte-se/30' }
    })
    const source = details.sources[0]
    expect(source).toMatchObject({
      seriesUrl: 'https://toonlivre.net/retorno-de-10-000x-irma-senior-por-favor-comporte-se',
      lastReadUrl: 'https://toonlivre.net/retorno-de-10-000x-irma-senior-por-favor-comporte-se/30'
    })
    for (const value of [30, 37, 134]) {
      expect(resolution.resolve({
        url: `https://toonlivre.net/retorno-de-10-000x-irma-senior-por-favor-comporte-se/${value}`,
        title: `Retorno de 10.000x - Capítulo ${value} | ToonLivre`,
        detectedChapter: { value: String(value), numericValue: value, confidence: 'high', source: 'url' }
      })).toMatchObject({
        status: 'matched',
        work: { id: details.work.id },
        source: { id: source.id },
        match: { matchedBy: 'source_url', confidence: value === 30 ? 'exact' : 'high' }
      })
    }
  })

  it('reconhece source legacy em /30 ao receber a página irmã /37', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'Obra - Capítulo 30', '30')
    fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://reader.example/slug/30' })
    expect(resolution.resolve({
      url: 'https://reader.example/slug/37',
      detectedChapter: { value: '37', numericValue: 37, confidence: 'high', source: 'url' }
    })).toMatchObject({ status: 'matched', work: { id: work.id }, match: { confidence: 'high' } })
  })

  it('não trata IDs numéricos nem caminhos de obras diferentes como páginas irmãs', () => {
    const { fixture, resolution } = setup()
    const idWork = createMinimalWork(fixture, 'Título por ID')
    fixture.services.sources.createSource({ workId: idWork.id, seriesUrl: 'https://reader.example/title/12345' })
    expect(resolution.resolve({ url: 'https://reader.example/title/67890' })).toEqual({ status: 'not_found' })

    const workA = createMinimalWork(fixture, 'Obra A')
    fixture.services.sources.createSource({ workId: workA.id, seriesUrl: 'https://reader.example/obra-a/30' })
    expect(resolution.resolve({
      url: 'https://reader.example/obra-b/30',
      detectedChapter: { value: '30', numericValue: 30, confidence: 'high', source: 'url' }
    })).toEqual({ status: 'not_found' })
  })

  it('não usa canonical contraditório como identidade da página', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'Outra obra')
    fixture.services.sources.createSource({ workId: work.id, seriesUrl: 'https://reader.example/outra-obra' })
    expect(resolution.resolve({
      url: 'https://reader.example/obra-certa/37',
      canonicalUrl: 'https://reader.example/outra-obra',
      detectedChapter: { value: '37', numericValue: 37, confidence: 'high', source: 'url' }
    })).toEqual({ status: 'not_found' })
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
    const first = createMinimalWork(fixture, 'A Lenda do Norte')
    fixture.services.works.createWork({ title: 'A Lenda do Norte: Retorno', mediaType: 'manhwa', userStatus: 'reading', reviewedWorkIds: [first.id] })
    expect(resolution.resolve({ url: 'https://example.com', title: 'Lenda do Norte' })).toMatchObject({ status: 'ambiguous', candidates: expect.arrayContaining([expect.objectContaining({ match: { confidence: 'possible', matchedBy: 'title' } })]) })
    expect(resolution.resolve({ url: 'https://example.com', title: 'Obra inexistente' })).toEqual({ status: 'not_found' })
  })

  it('não confunde títulos semelhantes entre ToonLivre e Nexus sem sinal forte', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'O Retorno do Cão de Caça dos Baskerville', '180')
    fixture.services.sources.createSource({
      workId: work.id,
      name: 'ToonLivre',
      seriesUrl: 'https://toonlivre.net/o-retorno-do-cao-de-caca-dos-baskerville'
    })

    expect(resolution.resolve({
      url: 'https://nexusmangas.com/a-vinganca-do-cao-de-caca-dos-baskerville/179',
      title: 'A Vingança do Cão de Caça dos Baskerville | NexusMangás',
      siteName: 'NexusMangás'
    })).toEqual({ status: 'not_found' })
  })

  it('resolve outra source por alias exato, remove sufixos técnicos e deixa vínculo explícito', () => {
    const { fixture, resolution } = setup()
    const work = createMinimalWork(fixture, 'O Retorno do Cão de Caça dos Baskerville', '180')
    fixture.services.sources.createSource({
      workId: work.id,
      name: 'ToonLivre',
      seriesUrl: 'https://toonlivre.net/o-retorno-do-cao-de-caca-dos-baskerville'
    })
    fixture.services.details.createAlias({
      workId: work.id,
      name: 'A Vingança do Cão de Caça dos Baskerville'
    })
    const page = {
      url: 'https://nexusmangas.com/a-vinganca-do-cao-de-caca-dos-baskerville/179',
      title: 'A Vingança do Cão de Caça dos Baskerville - Capítulo 179 | NexusMangás',
      siteName: 'NexusMangás',
      detectedChapter: { value: '179', numericValue: 179, confidence: 'high' as const, source: 'url' as const }
    }

    expect(resolution.resolve(page)).toMatchObject({
      status: 'matched', work: { id: work.id }, match: { matchedBy: 'alias', confidence: 'high' }
    })
    expect(fixture.services.workContext.getContext({ workId: work.id, page }).source).toEqual({ state: 'unlinked' })
    expect(fixture.repositories.sources.listByWork(work.id)).toHaveLength(1)

    const source = fixture.services.sources.createSource({
      workId: work.id,
      name: 'NexusMangás',
      seriesUrl: page.url
    }, {
      pageUrl: page.url,
      detectedChapter: page.detectedChapter,
      title: page.title,
      domain: 'nexusmangas.com'
    })
    expect(fixture.services.workContext.getContext({ workId: work.id, page }).source).toMatchObject({
      state: 'linked', matchedSourceId: source.id
    })
    expect(fixture.repositories.sources.listByWork(work.id)).toHaveLength(2)
  })
})
