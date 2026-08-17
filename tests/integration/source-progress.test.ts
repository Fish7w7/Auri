import { afterEach, describe, expect, it } from 'vitest'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

function captureError(operation: () => unknown): unknown {
  try {
    operation()
    return null
  } catch (error) {
    return error
  }
}

describe('SourceService', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('mantém múltiplas fontes e troca a única preferida transacionalmente', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const first = fixture.services.sources.createSource({
      workId: work.id,
      name: 'Scan A',
      domain: 'a.example',
      isPreferred: true
    })
    const second = fixture.services.sources.createSource({
      workId: work.id,
      name: 'Scan B',
      domain: 'b.example'
    })

    expect(fixture.services.sources.listByWork({ workId: work.id })).toHaveLength(2)
    fixture.services.sources.setPreferredSource({ sourceId: second.id })
    expect(fixture.repositories.sources.findById(first.id)?.isPreferred).toBe(false)
    expect(fixture.repositories.sources.findById(second.id)?.isPreferred).toBe(true)
    expect(
      fixture.db
        .prepare('SELECT COUNT(*) AS count FROM sources WHERE work_id = ? AND is_preferred = 1')
        .get(work.id)
    ).toEqual({ count: 1 })
  })

  it('arquiva, remove preferência e marca fonte indisponível', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const archived = fixture.services.sources.createSource({
      workId: work.id,
      domain: 'old.example',
      isPreferred: true
    })
    const unavailable = fixture.services.sources.createSource({
      workId: work.id,
      domain: 'down.example'
    })

    expect(fixture.services.sources.archiveSource({ sourceId: archived.id })).toMatchObject({
      status: 'archived',
      isPreferred: false
    })
    expect(
      fixture.services.sources.markSourceUnavailable({ sourceId: unavailable.id }).status
    ).toBe('unavailable')
  })

  it('preserva snapshot do histórico ao excluir permanentemente a fonte', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '183')
    const source = fixture.services.sources.createSource({
      workId: work.id,
      name: 'OldScan',
      domain: 'oldscan.example'
    })
    const result = fixture.services.progress.updateProgress({
      workId: work.id,
      chapterLabel: '184',
      sourceId: source.id
    })
    expect(result.applied).toBe(true)

    fixture.services.sources.deleteSourcePermanently({ sourceId: source.id })
    const event = fixture.repositories.history.findLatestByWork(work.id)!
    expect(event).toMatchObject({
      sourceId: null,
      sourceNameSnapshot: 'OldScan',
      sourceDomainSnapshot: 'oldscan.example'
    })
  })
})

describe('ProgressService', () => {
  let fixture: ReturnType<typeof createDomainFixture> | undefined
  afterEach(() => fixture?.db.close())

  it('atualiza 183 → 184, registra histórico e last_read_at', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '183')
    const result = fixture.services.progress.updateProgress({
      workId: work.id,
      chapterLabel: '184',
      occurredAt: '2026-08-18T10:00:00.000Z'
    })
    expect(result).toMatchObject({
      applied: true,
      progress: {
        chapter: { label: '184', number: 184 },
        lastReadAt: '2026-08-18T10:00:00.000Z'
      },
      history: {
        eventType: 'progress_update',
        oldChapter: { label: '183', number: 183 },
        newChapter: { label: '184', number: 184 }
      }
    })
  })

  it('aceita salto normal 183 → 191 sem classificá-lo como correção', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '183')
    const result = fixture.services.progress.updateProgress({ workId: work.id, chapterLabel: '191' })
    expect(result).toMatchObject({ applied: true, history: { eventType: 'progress_update' } })
  })

  it('sinaliza regressão 183 → 160 e só aplica após confirmação', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '183')
    const warning = fixture.services.progress.updateProgress({ workId: work.id, chapterLabel: '160' })
    expect(warning).toMatchObject({
      applied: false,
      requiresConfirmation: true,
      reason: 'regression'
    })
    expect(fixture.repositories.works.findById(work.id)?.lastReadChapter?.label).toBe('183')

    const applied = fixture.services.progress.updateProgress({
      workId: work.id,
      chapterLabel: '160',
      confirmSuspicious: true,
      eventType: 'correction'
    })
    expect(applied).toMatchObject({
      applied: true,
      history: { eventType: 'correction', newChapter: { label: '160', number: 160 } }
    })
  })

  it('sinaliza large_jump acima do limite configurado sem alterar o banco', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '10')
    const warning = fixture.services.progress.updateProgress({ workId: work.id, chapterLabel: '100' })
    expect(warning).toMatchObject({
      applied: false,
      requiresConfirmation: true,
      reason: 'large_jump'
    })
    expect(fixture.repositories.works.findById(work.id)?.lastReadChapter?.label).toBe('10')
  })

  it('incrementa e decrementa capítulos inteiros e decimais por 1', () => {
    fixture = createDomainFixture()
    const integer = createMinimalWork(fixture, 'Inteiro', '183')
    expect(fixture.services.progress.incrementProgress({ workId: integer.id })).toMatchObject({
      progress: { chapter: { label: '184', number: 184 } }
    })
    expect(fixture.services.progress.decrementProgress({ workId: integer.id })).toMatchObject({
      progress: { chapter: { label: '183', number: 183 } }
    })

    const decimal = createMinimalWork(fixture, 'Decimal', '183.5')
    expect(fixture.services.progress.incrementProgress({ workId: decimal.id })).toMatchObject({
      progress: { chapter: { label: '184.5', number: 184.5 } }
    })
    expect(fixture.services.progress.decrementProgress({ workId: decimal.id })).toMatchObject({
      progress: { chapter: { label: '183.5', number: 183.5 } }
    })
  })

  it.each(['Prólogo', '10A'])('aceita capítulo textual %s e recusa +1 automático', (chapter) => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, `Obra ${chapter}`, chapter)
    expect(work.lastReadChapter).toEqual({ label: chapter, number: null })
    expect(
      captureError(() => fixture!.services.progress.incrementProgress({ workId: work.id }))
    ).toMatchObject({ code: 'CHAPTER_NOT_NUMERIC' })
  })

  it('atualiza last_used_at da fonte e mantém snapshot', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '1')
    const source = fixture.services.sources.createSource({
      workId: work.id,
      name: 'Fonte',
      domain: 'fonte.example'
    })
    const result = fixture.services.progress.updateProgress({
      workId: work.id,
      chapterLabel: '2',
      sourceId: source.id,
      occurredAt: '2026-08-20T12:00:00.000Z'
    })
    expect(fixture.repositories.sources.findById(source.id)?.lastUsedAt).toBe(
      '2026-08-20T12:00:00.000Z'
    )
    expect(result).toMatchObject({
      history: { sourceNameSnapshot: 'Fonte', sourceDomainSnapshot: 'fonte.example' }
    })
  })

  it('reverte toda a transaction se o histórico falhar', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '10')
    fixture.db.exec(`
      CREATE TRIGGER fail_history BEFORE INSERT ON reading_history
      BEGIN SELECT RAISE(ABORT, 'intentional history failure'); END;
    `)

    expect(() =>
      fixture!.services.progress.updateProgress({ workId: work.id, chapterLabel: '11' })
    ).toThrow('intentional history failure')
    expect(fixture.repositories.works.findById(work.id)?.lastReadChapter).toEqual({
      label: '10',
      number: 10
    })
    expect(fixture.repositories.history.listByWork(work.id)).toHaveLength(1)
  })

  it('desfaz criando novo histórico que referencia o evento original', () => {
    fixture = createDomainFixture()
    const work = createMinimalWork(fixture, 'Obra', '183')
    const change = fixture.services.progress.updateProgress({ workId: work.id, chapterLabel: '184' })
    if (!change.applied) throw new Error('Alteração deveria ter sido aplicada.')

    const undo = fixture.services.progress.undoProgressChange({ historyId: change.history.id })
    expect(undo).toMatchObject({
      applied: true,
      progress: { chapter: { label: '183', number: 183 } },
      history: {
        eventType: 'undo',
        oldChapter: { label: '184', number: 184 },
        newChapter: { label: '183', number: 183 },
        revertsHistoryId: change.history.id
      }
    })
    expect(fixture.repositories.history.listByWork(work.id)).toHaveLength(3)
  })
})
