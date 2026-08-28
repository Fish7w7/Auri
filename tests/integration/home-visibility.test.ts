import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialSchemaMigration } from '@main/database/migrations/001-initial-schema'
import { createMigrations } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { createDomainFixture } from '../helpers/domain-fixture'
import { TestLogger } from '../helpers/test-logger'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('visibilidade individual na Home', () => {
  it('exclui somente das seções automáticas e preserva status, progresso, histórico e favorito', () => {
    const fixture = createDomainFixture()
    const work = fixture.services.works.createWork({
      title: 'Romance acumulando', mediaType: 'manhwa', userStatus: 'reading', chapter: '12',
      favorite: true, hiddenFromHome: true
    })
    const historyBefore = fixture.repositories.history.listByWork(work.id)

    expect(Object.values(fixture.services.library.getHome()).flat()).not.toContainEqual(expect.objectContaining({ id: work.id }))
    expect(fixture.services.library.queryWorks({}).map((item) => item.id)).toContain(work.id)
    expect(fixture.services.library.queryWorks({ hiddenFromHome: true }).map((item) => item.id)).toEqual([work.id])

    fixture.services.works.updateWork({ id: work.id, hiddenFromHome: false })
    expect(fixture.services.library.getHome().continueReading.map((item) => item.id)).toContain(work.id)
    expect(fixture.services.works.getWork({ workId: work.id })).toMatchObject({
      userStatus: 'reading', favorite: true, hiddenFromHome: false,
      lastReadChapter: { label: '12', number: 12 }
    })
    expect(fixture.repositories.history.listByWork(work.id)).toEqual(historyBefore)
    fixture.db.close()
  })

  it('aceita todos os status e aplica Ocultar/Mostrar em lote atomicamente', () => {
    const fixture = createDomainFixture()
    const statuses = ['want_to_read', 'reading', 'paused', 'waiting', 'completed', 'dropped'] as const
    const works = statuses.map((userStatus) => fixture.services.works.createWork({
      title: `Obra ${userStatus}`, mediaType: 'manhwa', userStatus, hiddenFromHome: true
    }))
    expect(fixture.services.library.queryWorks({ hiddenFromHome: true })).toHaveLength(statuses.length)
    expect(Object.values(fixture.services.library.getHome()).flat()).toHaveLength(0)

    fixture.services.bulk.setHomeVisibility({ workIds: works.map((work) => work.id), hiddenFromHome: false })
    expect(fixture.services.library.queryWorks({ hiddenFromHome: true })).toHaveLength(0)
    expect(fixture.services.library.queryWorks({ hiddenFromHome: false })).toHaveLength(statuses.length)
    fixture.db.close()
  })

  it('migra bancos existentes com todas as obras visíveis e persiste a preferência após reabrir', () => {
    const root = mkdtempSync(join(tmpdir(), 'auri-home-visibility-')); roots.push(root)
    const path = join(root, 'library.sqlite')
    const legacy = new Database(path)
    new MigrationRunner(legacy, new TestLogger(), [createInitialSchemaMigration(legacy)]).run()
    legacy.prepare(`INSERT INTO works (
      id, title, normalized_title, media_type, user_status, cover_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('legacy', 'Legada', 'legada', 'manhwa', 'reading', 'none', '2026-08-17', '2026-08-17')
    expect(new MigrationRunner(legacy, new TestLogger(), createMigrations(legacy)).run()).toBe(3)
    expect(legacy.prepare('SELECT hidden_from_home FROM works WHERE id = ?').pluck().get('legacy')).toBe(0)
    legacy.close()

    let fixture = createDomainFixture(path)
    const created = fixture.services.works.createWork({ title: 'Persistente', mediaType: 'manhwa', userStatus: 'waiting', hiddenFromHome: true })
    fixture.db.close()
    fixture = createDomainFixture(path)
    expect(fixture.services.works.getWork({ workId: created.id }).hiddenFromHome).toBe(true)
    fixture.db.close()
  })
})
