import { afterEach, describe, expect, it } from 'vitest'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const fixtures: Array<ReturnType<typeof createDomainFixture>> = []
function setup() {
  const fixture = createDomainFixture()
  fixtures.push(fixture)
  return fixture
}
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.db.close() })

describe('estatísticas da biblioteca', () => {
  it('distingue biblioteca vazia de obras sem histórico', () => {
    const fixture = setup()
    const { library, works } = fixture.services
    const now = new Date('2026-08-18T13:00:00.000Z')
    const request = { period: 7, groupBy: 'day' }
    expect(library.getStatistics(request, now)).toMatchObject({
      library: { total: 0 }, activity: { records: 0 }, timeline: [], ranking: []
    })
    works.createWork({ title: 'Planejada', mediaType: 'manga', userStatus: 'want_to_read' })
    expect(library.getStatistics(request, now)).toMatchObject({
      library: { total: 1, notStarted: 1, byMediaType: { manga: 1 } },
      activity: { records: 0 }, timeline: [], ranking: []
    })
  })

  it('conta registros persistidos, deduz um desfazer e mantém a unidade de avanço por evento', () => {
    const fixture = setup()
    const work = createMinimalWork(fixture, 'Em andamento', '1')
    const { progress, library, works } = fixture.services
    const closed = works.createWork({ title: 'Terminada', mediaType: 'novel', userStatus: 'completed' })
    const paused = works.createWork({ title: 'Pausada', mediaType: 'manga', userStatus: 'paused' })
    progress.updateProgress({ workId: work.id, chapterLabel: '100', confirmSuspicious: true })
    progress.updateProgress({ workId: work.id, chapterLabel: '8', confirmSuspicious: true, eventType: 'correction' })
    const reverted = progress.incrementProgress({ workId: work.id })
    if (!reverted.applied) throw Error('Avanço do fixture não persistiu')
    progress.undoProgressChange({ historyId: reverted.history.id })
    progress.updateProgress({ workId: closed.id, chapterLabel: 'Extra' })
    progress.updateProgress({ workId: paused.id, chapterLabel: '1' })

    const now = new Date('2026-08-18T13:00:00.000Z')
    const all = library.getStatistics({ period: 7, groupBy: 'day' }, now)
    expect(all.library).toMatchObject({ total: 3, completed: 1, inProgress: 2 })
    expect(all.activity).toEqual({ records: 5, updates: 3, advances: 1 })
    expect(all.ranking[0]).toMatchObject({ workId: work.id, records: 3, updates: 1, advances: 1 })
    expect(all.timeline).toHaveLength(7)
    expect(all.timeline.reduce((total, bucket) => total + bucket.records, 0)).toBe(5)

    const onlyReading = library.getStatistics({ period: 7, groupBy: 'week', mediaType: 'manhwa', status: 'reading' }, now)
    expect(onlyReading).toMatchObject({ library: { total: 1 }, activity: { records: 3, advances: 1 } })
    expect(onlyReading.ranking.map(({ workId }) => workId)).toEqual([work.id])
    expect(onlyReading.timeline.filter(({ records }) => records > 0)).toEqual([
      { start: '2026-08-17', records: 3, updates: 1, advances: 1 }
    ])
  })

  it('aplica os intervalos ao histórico e exclui da leitura as obras na Lixeira até restaurá-las', () => {
    const fixture = setup()
    const work = createMinimalWork(fixture)
    const { progress, library, works } = fixture.services
    const now = new Date(2026, 10, 8, 12)
    for (const [daysAgo, chapterLabel] of [[89, '1'], [29, '2'], [6, '3'], [0, '4']] as const) {
      const occurredAt = new Date(2026, 10, 8 - daysAgo, 8).toISOString()
      progress.updateProgress({ workId: work.id, chapterLabel, occurredAt })
    }
    for (const [period, records] of [[7, 2], [30, 3], [90, 4], ['all', 4]] as const) {
      expect(library.getStatistics({ period, groupBy: 'month' }, now).activity.records).toBe(records)
    }
    works.moveToTrash({ workId: work.id })
    expect(library.getStatistics({ period: 'all', groupBy: 'month' }, now)).toMatchObject({ library: { total: 0 }, activity: { records: 0 } })
    works.restoreWork({ workId: work.id })
    expect(library.getStatistics({ period: 'all', groupBy: 'month' }, now).activity.records).toBe(4)
  })

  it('agrega 20 mil registros no SQLite sem transportar o histórico bruto', () => {
    const fixture = setup()
    const work = createMinimalWork(fixture)
    const now = new Date('2026-09-05T15:00:00.000Z')
    fixture.db.prepare(`
      WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < 20000)
      INSERT INTO reading_history(id, work_id, event_type, old_chapter_number, new_chapter_number, occurred_at, created_at)
      SELECT 'test-' || i, @workId, 'progress_update', i, i + 1, datetime(@now, '-' || (i % 400) || ' days'), @now FROM seq
    `).run({ workId: work.id, now: now.toISOString() })
    const started = performance.now()
    const statistics = fixture.services.library.getStatistics({ period: 'all', groupBy: 'day' }, now)
    expect(performance.now() - started).toBeLessThan(2_000)
    expect(statistics.activity).toEqual({ records: 20000, updates: 20000, advances: 20000 })
    expect(statistics.timeline).toHaveLength(180)
    expect(statistics.timelineTruncated).toBe(true)
    expect(statistics.ranking).toHaveLength(1)
  })
})
