import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDomainFixture } from '../helpers/domain-fixture'

describe('LibraryService com 1.000 obras temporárias', () => {
  const fixture = createDomainFixture()
  beforeAll(() => {
    const insert = fixture.db.transaction(() => {
      for (let index = 0; index < 1000; index += 1) {
        fixture.services.works.createWork({
          title: `Obra ${String(index).padStart(4, '0')}`,
          mediaType: index % 2 ? 'manga' : 'manhwa',
          userStatus: index % 3 ? 'reading' : 'waiting',
          favorite: index % 10 === 0,
          chapter: String(index + 1)
        })
      }
    })
    insert.immediate()
  }, 15_000)
  afterAll(() => fixture.db.close())

  it('filtra e ordena sem depender de dados reais', () => {
    const started = performance.now()
    const results = fixture.services.library.queryWorks({ mediaTypes: ['manhwa'], favorite: true, sort: 'chapter_desc' })
    const duration = performance.now() - started
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((work) => work.mediaType === 'manhwa' && work.favorite)).toBe(true)
    expect(duration).toBeLessThan(2000)
  })
})
