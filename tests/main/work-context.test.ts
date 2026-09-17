import { afterEach, describe, expect, it } from 'vitest'
import type { DetectedChapter } from '@auri/protocol'
import { getPageRelation } from '@main/services/work-context-service'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })

function setup(chapter: string | null = '14') {
  const fixture = createDomainFixture()
  fixtures.push(fixture)
  const work = createMinimalWork(fixture, 'O Governante das Trevas', chapter ?? undefined)
  const source = fixture.services.sources.createSource({
    workId: work.id,
    name: 'ToonLivre',
    seriesUrl: 'https://toonlivre.net/o-governante-das-trevas',
    lastReadUrl: chapter ? `https://toonlivre.net/o-governante-das-trevas/${chapter}` : null,
    isPreferred: true
  })
  return { fixture, work, source }
}

function detected(value: string, numericValue?: number): DetectedChapter {
  return {
    value,
    ...(numericValue !== undefined ? { numericValue } : {}),
    confidence: 'high',
    source: 'url'
  }
}

describe('WorkContextService', () => {
  it('retorna contexto linked e target persistido ao consultar a página raiz', () => {
    const { fixture, work, source } = setup()

    const result = fixture.services.workContext.getContext({
      workId: work.id,
      page: { url: 'https://toonlivre.net/o-governante-das-trevas' }
    })

    expect(result).toEqual({
      work: {
        id: work.id,
        title: 'O Governante das Trevas',
        userStatus: 'reading',
        progress: { value: '14', numericValue: 14 }
      },
      page: { detectedChapter: null, relation: 'series_page' },
      source: {
        state: 'linked',
        matchedSourceId: source.id,
        name: 'ToonLivre',
        domain: 'toonlivre.net',
        seriesUrl: 'https://toonlivre.net/o-governante-das-trevas',
        lastReadUrl: 'https://toonlivre.net/o-governante-das-trevas/14'
      },
      continueTarget: {
        url: 'https://toonlivre.net/o-governante-das-trevas/14',
        chapter: { value: '14', numericValue: 14 }
      }
    })
  })

  it.each([
    [16, 'ahead'],
    [14, 'same'],
    [10, 'behind']
  ] as const)('classifica página %s como %s sem substituir o target conhecido', (chapter, relation) => {
    const { fixture, work } = setup()
    const result = fixture.services.workContext.getContext({
      workId: work.id,
      page: {
        url: `https://toonlivre.net/o-governante-das-trevas/${chapter}`,
        detectedChapter: detected(String(chapter), chapter)
      }
    })

    expect(result.page.relation).toBe(relation)
    expect(result.continueTarget?.url).toBe('https://toonlivre.net/o-governante-das-trevas/14')
    expect(fixture.repositories.works.findById(work.id)?.lastReadChapter?.number).toBe(14)
  })

  it('retorna unknown sem progresso ou quando capítulos não são comparáveis com segurança', () => {
    const withoutProgress = setup(null)
    expect(withoutProgress.fixture.services.workContext.getContext({
      workId: withoutProgress.work.id,
      page: {
        url: 'https://toonlivre.net/o-governante-das-trevas/2',
        detectedChapter: detected('2', 2)
      }
    }).page.relation).toBe('unknown')

    expect(getPageRelation({ label: 'Extra 2', number: null }, detected('Extra 2'))).toBe('unknown')
    expect(getPageRelation({ label: '14', number: 14 }, detected('14', 15))).toBe('unknown')
    expect(getPageRelation(null, null)).toBe('series_page')
  })

  it('distingue source nova confiável de canonical contraditório', () => {
    const { fixture, work } = setup()
    const unlinked = fixture.services.workContext.getContext({
      workId: work.id,
      page: {
        url: 'https://novo-reader.example/outra-copia/14',
        detectedChapter: detected('14', 14)
      }
    })
    const ambiguous = fixture.services.workContext.getContext({
      workId: work.id,
      page: {
        url: 'https://novo-reader.example/obra-certa/14',
        canonicalUrl: 'https://novo-reader.example/outra-obra',
        detectedChapter: detected('14', 14)
      }
    })

    expect(unlinked.source).toEqual({ state: 'unlinked' })
    expect(ambiguous.source).toEqual({ state: 'ambiguous' })
    expect(fixture.services.sources.listByWork({ workId: work.id })).toHaveLength(1)
  })

  it('não fabrica target a partir de seriesUrl e ignora URL persistida insegura', () => {
    const { fixture, work, source } = setup()
    fixture.repositories.sources.update({ ...source, lastReadUrl: null })
    expect(fixture.services.workContext.getContext({
      workId: work.id,
      page: { url: source.seriesUrl! }
    }).continueTarget).toBeNull()

    fixture.repositories.sources.update({ ...source, lastReadUrl: 'file:///C:/private/14' })
    expect(fixture.services.workContext.getContext({
      workId: work.id,
      page: { url: source.seriesUrl! }
    }).continueTarget).toBeNull()
  })

  it('é read-only para Work, Source e histórico', () => {
    const { fixture, work, source } = setup()
    const before = {
      work: fixture.repositories.works.findById(work.id),
      source: fixture.repositories.sources.findById(source.id),
      history: fixture.repositories.history.listByWork(work.id)
    }

    fixture.services.workContext.getContext({
      workId: work.id,
      page: {
        url: 'https://toonlivre.net/o-governante-das-trevas/16',
        detectedChapter: detected('16', 16)
      }
    })

    expect({
      work: fixture.repositories.works.findById(work.id),
      source: fixture.repositories.sources.findById(source.id),
      history: fixture.repositories.history.listByWork(work.id)
    }).toEqual(before)
  })

  it('reutiliza identidade legacy para página raiz e capítulo irmão', () => {
    const fixture = createDomainFixture()
    fixtures.push(fixture)
    const work = createMinimalWork(fixture, 'Obra Legacy', '14')
    const source = fixture.services.sources.createSource({
      workId: work.id,
      seriesUrl: 'https://reader.example/slug/14'
    })

    for (const page of [
      { url: 'https://reader.example/slug' },
      { url: 'https://reader.example/slug/37', detectedChapter: detected('37', 37) }
    ]) {
      expect(fixture.services.workContext.getContext({ workId: work.id, page }).source)
        .toMatchObject({ state: 'linked', matchedSourceId: source.id })
    }
  })

  it('retorna WORK_NOT_FOUND para obra ausente ou na lixeira', () => {
    const { fixture, work } = setup()
    const missing = crypto.randomUUID()
    expect(() => fixture.services.workContext.getContext({
      workId: missing,
      page: { url: 'https://reader.example/obra' }
    })).toThrowError(expect.objectContaining({ code: 'WORK_NOT_FOUND' }))

    fixture.services.works.moveToTrash({ workId: work.id })
    expect(() => fixture.services.workContext.getContext({
      workId: work.id,
      page: { url: 'https://reader.example/obra' }
    })).toThrowError(expect.objectContaining({ code: 'WORK_IN_TRASH' }))
  })
})
