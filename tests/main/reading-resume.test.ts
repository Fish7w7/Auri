import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

describe('retomada da leitura na Home', () => {
  it('ordena pelo último acesso ou progresso e mantém fontes e progresso após reabrir o banco', () => {
    const directory = mkdtempSync(join(tmpdir(), 'auri-resume-'))
    const path = join(directory, 'library.sqlite')
    let fixture = createDomainFixture(path)
    try {
      const recentlyOpened = createMinimalWork(fixture, 'Retomada pelo endereço', '1')
      const updated = createMinimalWork(fixture, 'Leitura com progresso', '2')
      const withoutSource = createMinimalWork(fixture, 'Leitura sem fonte')
      const source = fixture.services.sources.createSource({
        workId: recentlyOpened.id,
        name: 'Leitor A',
        seriesUrl: 'https://reader.example/series/a',
        lastReadUrl: 'https://reader.example/series/a/1'
      })
      fixture.services.sources.createSource({ workId: recentlyOpened.id, seriesUrl: 'https://reader.example/series/alt' })
      fixture.services.progress.updateProgress({ workId: updated.id, chapterLabel: '3' })
      fixture.services.sources.markSourceUsed({ sourceId: source.id })
      fixture.db.close()

      fixture = createDomainFixture(path)
      const home = fixture.services.library.getHome()
      expect(home.continueReading.map(({ id }) => id)).toEqual([recentlyOpened.id, updated.id, withoutSource.id])
      expect(home.continueReading[0].lastReadChapter?.label).toBe('1')
      expect(home.reading[recentlyOpened.id]).toMatchObject({ lastSource: 'Leitor A', lastActivityAt: expect.any(String), sourceCount: 2 })
      expect(home.reading[withoutSource.id]).toMatchObject({ lastSource: null, sourceCount: 0 })
      expect(fixture.repositories.sources.findById(source.id)?.lastReadUrl).toBe('https://reader.example/series/a/1')
    } finally {
      if (fixture.db.open) fixture.db.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
