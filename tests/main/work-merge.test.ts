import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { WorkMergePreview } from '@shared/contracts'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

describe('WorkMergeService', () => {
  it('gera preview somente leitura e rejeita IDs iguais ou obras ausentes', () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'Obra A', '180')
    const secondary = createMinimalWork(fixture, 'Obra B')
    const before = fixture.db.serialize()

    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })

    expect(preview.primary.id).toBe(primary.id)
    expect(preview.secondary.id).toBe(secondary.id)
    expect(preview.aliasesToAdd).toContain('Obra B')
    expect(fixture.db.serialize()).toEqual(before)
    expect(() => fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: primary.id })).toThrow('duas obras diferentes')
    expect(() => fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: randomUUID() })).toThrow('não existe')
    fixture.db.close()
  })

  it('mescla o caso real, preserva fontes, alias, busca e posição mais recente', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'O Retorno do Cão de Caça dos Baskerville', '180')
    const secondaryDraft = { title: 'A Vingança do Cão de Caça dos Baskerville', mediaType: 'manhwa', userStatus: 'reading' }
    expect(() => fixture.services.works.createWork(secondaryDraft)).toThrow('Revise as possíveis correspondências')
    const secondary = fixture.services.works.createWork({ ...secondaryDraft, reviewedWorkIds: [primary.id] })
    const other = createMinimalWork(fixture, 'Outra obra')
    await fixture.services.sources.createSource({ workId: primary.id, name: 'ToonLivre', seriesUrl: 'https://toon.example/obra', lastReadUrl: 'https://toon.example/obra/180', isPreferred: true })
    await fixture.services.sources.createSource({ workId: secondary.id, name: 'NexusMangás', seriesUrl: 'https://nexus.example/serie', lastReadUrl: 'https://nexus.example/serie/1' })
    fixture.services.settings.updateSettings({ recentWorkIds: [secondary.id, other.id, primary.id] })

    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    const result = await fixture.services.workMerge.merge({
      primaryWorkId: primary.id,
      secondaryWorkId: secondary.id,
      fieldChoices: Object.fromEntries(preview.conflicts.map((conflict) => [conflict.field, conflict.defaultWorkId])),
      preferredSourceId: preview.defaultPreferredSourceId
    })

    expect(result.work.id).toBe(primary.id)
    expect(result.work.lastReadChapter?.label).toBe('180')
    expect(fixture.repositories.works.findById(secondary.id)).toBeNull()
    expect(fixture.repositories.sources.listByWork(primary.id).map((source) => source.name)).toEqual(['ToonLivre', 'NexusMangás'])
    expect(fixture.repositories.aliases.listByWork(primary.id).map((alias) => alias.name)).toContain('A Vingança do Cão de Caça dos Baskerville')
    expect(fixture.services.library.searchWorks({ query: 'A Vingança do Cão de Caça dos Baskerville', recentWorkIds: [] })[0].id).toBe(primary.id)
    expect(fixture.services.settings.getSettings().recentWorkIds).toEqual([primary.id, other.id])
    fixture.db.close()
  })

  it('une relações, histórico e external ID sem violar a identidade global', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'Primary')
    const secondary = createMinimalWork(fixture, 'Secondary')
    const now = '2026-01-01T00:00:00.000Z'
    const ids = Array.from({ length: 9 }, () => randomUUID())
    fixture.db.prepare('INSERT INTO aliases VALUES (?, ?, ?, ?, NULL, NULL, ?)').run(ids[0], secondary.id, 'Nome antigo', 'nome antigo', now)
    fixture.db.prepare('INSERT INTO work_creators VALUES (?, ?, ?, ?, ?, NULL, ?)').run(ids[1], primary.id, 'Autor A', 'autor a', 'author', now)
    fixture.db.prepare('INSERT INTO work_creators VALUES (?, ?, ?, ?, ?, NULL, ?)').run(ids[2], secondary.id, 'Autor B', 'autor b', 'artist', now)
    fixture.db.prepare('INSERT INTO genres VALUES (?, ?, ?)').run(ids[3], 'Ação', 'acao')
    fixture.db.prepare('INSERT INTO work_genres VALUES (?, ?)').run(secondary.id, ids[3])
    fixture.db.prepare('INSERT INTO tags VALUES (?, ?, ?, ?)').run(ids[4], 'Favorita', 'favorita', now)
    fixture.db.prepare('INSERT INTO work_tags VALUES (?, ?)').run(secondary.id, ids[4])
    fixture.db.prepare('INSERT INTO collections VALUES (?, ?, NULL, ?, ?)').run(ids[5], 'Coleção', now, now)
    fixture.db.prepare('INSERT INTO collection_items VALUES (?, ?, ?)').run(ids[5], secondary.id, now)
    fixture.db.prepare('INSERT INTO external_refs VALUES (?, ?, ?, ?, ?, ?, ?)').run(ids[6], secondary.id, 'anilist', '123', 'https://anilist.co/manga/123', now, now)
    expect(() => fixture.db.prepare('INSERT INTO external_refs VALUES (?, ?, ?, ?, ?, ?, ?)').run(ids[7], primary.id, 'anilist', '123', null, null, now)).toThrow('UNIQUE constraint')
    fixture.db.prepare("INSERT INTO reading_history (id, work_id, source_id, event_type, occurred_at, created_at) VALUES (?, ?, NULL, 'progress_update', ?, ?)").run(ids[8], secondary.id, now, now)

    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    await fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(preview), preferredSourceId: preview.defaultPreferredSourceId })

    expect(fixture.repositories.creators.listByWork(primary.id)).toHaveLength(2)
    expect(fixture.repositories.genres.listByWork(primary.id)).toHaveLength(1)
    expect(fixture.repositories.tags.listByWork(primary.id)).toHaveLength(1)
    expect(fixture.repositories.collections.listByWork(primary.id)).toHaveLength(1)
    expect(fixture.repositories.history.listByWork(primary.id)).toHaveLength(1)
    expect(fixture.repositories.externalRefs.listByWork(primary.id)).toHaveLength(1)
    fixture.db.close()
  })

  it('coalesce a mesma source lógica preservando lastReadUrl e uma preferência', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'Primary')
    const secondary = createMinimalWork(fixture, 'Secondary')
    const now = '2026-01-01T00:00:00.000Z'
    await fixture.services.sources.createSource({ workId: primary.id, name: 'Site', seriesUrl: 'https://site.example/series/nano', isPreferred: true })
    fixture.repositories.sources.create({
      id: randomUUID(), workId: secondary.id, name: 'Site antigo', domain: 'site.example', language: null,
      seriesUrl: 'https://site.example/series/nano', lastReadUrl: 'https://site.example/series/nano/42',
      translatorGroup: null, status: 'active', isPreferred: true, lastUsedAt: now,
      createdAt: now, updatedAt: now
    })
    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })

    await fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(preview), preferredSourceId: preview.defaultPreferredSourceId })

    const sources = fixture.repositories.sources.listByWork(primary.id)
    expect(sources).toHaveLength(1)
    expect(sources[0].lastReadUrl).toBe('https://site.example/series/nano/42')
    expect(sources[0].isPreferred).toBe(true)
    fixture.db.close()
  })

  it('bloqueia external IDs contraditórios e revalida a preview no execute', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'Primary')
    const secondary = createMinimalWork(fixture, 'Secondary')
    const now = '2026-01-01T00:00:00.000Z'
    const valid = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    fixture.db.prepare('INSERT INTO external_refs VALUES (?, ?, ?, ?, NULL, NULL, ?)').run(randomUUID(), primary.id, 'anilist', '123', now)
    fixture.db.prepare('INSERT INTO external_refs VALUES (?, ?, ?, ?, NULL, NULL, ?)').run(randomUUID(), secondary.id, 'anilist', '456', now)
    const blocked = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    expect(blocked.blockers[0].code).toBe('EXTERNAL_ID_CONFLICT')
    await expect(fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(valid) })).rejects.toThrow('conflito bloqueante')
    expect(fixture.repositories.works.findById(secondary.id)).not.toBeNull()
    fixture.db.close()
  })

  it('exige escolhas para progresso, notas e escalares conflitantes', async () => {
    const fixture = createDomainFixture()
    const primary = fixture.services.works.createWork({ title: 'Primary', mediaType: 'manhwa', userStatus: 'reading', chapter: '180', notes: 'Nota A', rating: 8 })
    const secondary = fixture.services.works.createWork({ title: 'Secondary', mediaType: 'manga', userStatus: 'paused', chapter: 'Prólogo', notes: 'Nota B', rating: 9 })
    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    expect(preview.conflicts.map((conflict) => conflict.field)).toEqual(expect.arrayContaining(['progress', 'notes', 'userStatus', 'mediaType', 'rating']))
    await expect(fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: {} })).rejects.toThrow('Escolha um valor')
    const choices = defaults(preview)
    choices.progress = secondary.id
    choices.notes = secondary.id
    const result = await fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: choices })
    expect(result.work.lastReadChapter?.label).toBe('Prólogo')
    expect(result.work.notes).toBe('Nota B')
    fixture.db.close()
  })

  it('faz rollback integral quando uma falha ocorre antes da remoção final', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'Primary')
    const secondary = createMinimalWork(fixture, 'Secondary')
    await fixture.services.sources.createSource({ workId: secondary.id, name: 'Site', seriesUrl: 'https://site.example/secondary' })
    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    fixture.db.exec(`CREATE TRIGGER fail_merge BEFORE DELETE ON works WHEN OLD.id = '${secondary.id}' BEGIN SELECT RAISE(ABORT, 'forced merge failure'); END`)

    await expect(fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(preview) })).rejects.toThrow('forced merge failure')

    expect(fixture.repositories.works.findById(primary.id)?.title).toBe('Primary')
    expect(fixture.repositories.works.findById(secondary.id)?.title).toBe('Secondary')
    expect(fixture.repositories.sources.listByWork(secondary.id)).toHaveLength(1)
    fixture.db.close()
  })

  it('preserva um título limpo da Secondary como alias', async () => {
    const aliases = await mergeAndListAliases('A Vingança do Cão de Caça dos Baskerville')
    expect(aliases).toContain('A Vingança do Cão de Caça dos Baskerville')
  })

  it('remove ruído SEO estrutural sem normalizar o texto visível', async () => {
    const aliases = await mergeAndListAliases(
      'A Vingança do Cão de Caça dos Baskerville - Ler Online Grátis | NexusMangás',
      { sourceName: 'NexusMangás', sourceDomain: 'nexusmangas.example' }
    )
    expect(aliases).toContain('A Vingança do Cão de Caça dos Baskerville')
    expect(aliases.some((alias) => alias.includes('Ler Online'))).toBe(false)
  })

  it('prefere o alias humano existente e não cria uma cópia SEO', async () => {
    const aliases = await mergeAndListAliases(
      'A Vingança do Cão de Caça dos Baskerville - Ler Online Grátis | NexusMangás',
      {
        sourceName: 'NexusMangás', sourceDomain: 'nexusmangas.example',
        aliases: ['A Vingança do Cão de Caça dos Baskerville']
      }
    )
    expect(aliases.filter((alias) => alias === 'A Vingança do Cão de Caça dos Baskerville')).toHaveLength(1)
    expect(aliases.some((alias) => alias.includes('Ler Online'))).toBe(false)
  })

  it('não cria alias redundante ao título equivalente da Primary', async () => {
    const fixture = createDomainFixture()
    const primary = createMinimalWork(fixture, 'A Vingança do Cao de Caca dos Baskerville')
    const secondary = fixture.services.works.createWork({
      title: 'A Vingança do Cão de Caça dos Baskerville', mediaType: 'manhwa', userStatus: 'reading', reviewedWorkIds: [primary.id]
    })
    const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
    await fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(preview) })
    expect(fixture.repositories.aliases.listByWork(primary.id)).toHaveLength(0)
    fixture.db.close()
  })

  it('preserva Online quando a palavra pertence ao título', async () => {
    const aliases = await mergeAndListAliases('Love Online')
    expect(aliases).toContain('Love Online')
  })

  it('continua transferindo aliases normais da Secondary', async () => {
    const aliases = await mergeAndListAliases('Secondary', { aliases: ['Título alternativo legítimo'] })
    expect(aliases).toEqual(expect.arrayContaining(['Secondary', 'Título alternativo legítimo']))
  })
})

function defaults(preview: WorkMergePreview) {
  return Object.fromEntries(preview.conflicts.map((conflict) => [conflict.field, conflict.defaultWorkId]))
}

async function mergeAndListAliases(title: string, options: {
  sourceName?: string
  sourceDomain?: string
  aliases?: string[]
} = {}): Promise<string[]> {
  const fixture = createDomainFixture()
  const primary = createMinimalWork(fixture, 'O Retorno do Cão de Caça dos Baskerville')
  const secondary = fixture.services.works.createWork({
    title, mediaType: 'manhwa', userStatus: 'reading',
    aliases: options.aliases?.map((name) => ({ name })),
    reviewedWorkIds: [primary.id]
  })
  if (options.sourceName || options.sourceDomain) {
    await fixture.services.sources.createSource({
      workId: secondary.id,
      name: options.sourceName ?? null,
      domain: options.sourceDomain,
      seriesUrl: `https://${options.sourceDomain ?? 'source.example'}/obra`
    })
  }
  const preview = fixture.services.workMerge.previewMerge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id })
  await fixture.services.workMerge.merge({ primaryWorkId: primary.id, secondaryWorkId: secondary.id, fieldChoices: defaults(preview), preferredSourceId: preview.defaultPreferredSourceId })
  const aliases = fixture.repositories.aliases.listByWork(primary.id).map((alias) => alias.name)
  fixture.db.close()
  return aliases
}
