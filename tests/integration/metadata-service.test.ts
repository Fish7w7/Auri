import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { MetadataWork } from '@shared/contracts'
import { AssetService } from '@main/services/asset-service'
import { CoverService } from '@main/services/covers/cover-service'
import type { MetadataProvider } from '@main/services/metadata/types'
import { MetadataService } from '@main/services/metadata/metadata-service'
import { createDomainFixture, createMinimalWork } from '../helpers/domain-fixture'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

const base: MetadataWork = { provider: 'anilist', externalId: '42', title: 'Nano Machine', originalTitle: '나노마신', aliases: [{ name: 'Nano Mashin', kind: 'synonym' }], description: 'Descrição externa', mediaType: 'manhwa', publicationStatus: 'ongoing', countryCode: 'KR', startDate: '2020', endDate: null, creators: [{ name: 'Autor', role: 'author' }], genres: ['Ação'], coverUrl: null, canonicalUrl: 'https://anilist.co/manga/42' }

function setup(initial: MetadataWork = base, providerOverride?: MetadataProvider) {
  const fixture = createDomainFixture()
  const root = mkdtempSync(join(tmpdir(), 'auri-metadata-')); directories.push(root)
  let current = initial
  let searches = 0
  const provider: MetadataProvider = providerOverride ?? { id: 'anilist', search: async () => { searches += 1; return [{ provider: current.provider, externalId: current.externalId, title: current.title, originalTitle: current.originalTitle, mediaType: current.mediaType, publicationStatus: current.publicationStatus, countryCode: current.countryCode, startDate: current.startDate, coverUrl: current.coverUrl, canonicalUrl: current.canonicalUrl }] }, getById: async (id) => id === current.externalId ? current : null }
  const assets = new AssetService(join(root, 'assets'), fixture.services.works)
  const covers = new CoverService(join(root, 'cache'), fixture.repositories.works, assets, { isOnline: () => false, download: async () => { throw new Error('offline') } })
  const service = new MetadataService(fixture.db, [provider], { works: fixture.repositories.works, aliases: fixture.repositories.aliases, creators: fixture.repositories.creators, genres: fixture.repositories.genres, externalRefs: fixture.repositories.externalRefs, overrides: fixture.repositories.overrides }, fixture.services.details, covers, fixture.clock)
  return { ...fixture, service, setMetadata: (value: MetadataWork) => { current = value }, searches: () => searches }
}

describe('MetadataService', () => {
  it('cancela uma busca substituída e deixa somente a nova concluir', async () => {
    const result = [{ provider: 'anilist', externalId: '42', title: 'Nova', originalTitle: null, mediaType: 'manga' as const, publicationStatus: null, countryCode: null, startDate: null, coverUrl: null, canonicalUrl: null }]
    let oldSignal: AbortSignal | undefined
    const provider: MetadataProvider = {
      id: 'anilist',
      search: async (query, signal) => {
        if (query === 'Nova') return result
        oldSignal = signal
        return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      },
      getById: async () => null
    }
    const fixture = setup(base, provider)
    const old = fixture.service.search({ query: 'Antiga', requestId: 'dialog-search' })
    await Promise.resolve()
    await expect(fixture.service.search({ query: 'Nova', requestId: 'dialog-search' })).resolves.toEqual(result)
    await expect(old).rejects.toThrow('cancelled')
    expect(oldSignal?.aborted).toBe(true)
    fixture.db.close()
  })

  it('deduplica busca, importa tudo atomicamente e detecta ref exata', async () => {
    const fixture = setup()
    const [first, second] = await Promise.all([fixture.service.search({ query: 'Nano' }), fixture.service.search({ query: 'Nano' })])
    expect(first).toEqual(second); expect(fixture.searches()).toBe(1)
    const details = await fixture.service.import({ provider: 'anilist', externalId: '42', title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading', chapter: '12' })
    expect(details.externalRefs[0]).toMatchObject({ provider: 'anilist', externalId: '42', canonicalUrl: base.canonicalUrl })
    expect(details.externalRefs[0].lastSyncedAt).not.toBeNull()
    expect(details.work.metadataUpdatedAt).not.toBeNull()
    expect(details.creators[0].source).toBe('anilist')
    await expect(fixture.service.review({ provider: 'anilist', externalId: '42' })).resolves.toMatchObject({ duplicate: { kind: 'active', work: { id: details.work.id } } })
    await expect(fixture.service.import({ provider: 'anilist', externalId: '42', title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading' })).rejects.toMatchObject({ code: 'METADATA_DUPLICATE_ACTIVE' })
    fixture.db.close()
  })

  it('avisa provável duplicata e exige decisão explícita', async () => {
    const fixture = setup()
    createMinimalWork(fixture, 'Nano Mashin')
    await expect(fixture.service.review({ provider: 'anilist', externalId: '42' })).resolves.toMatchObject({ duplicate: { kind: 'probable' } })
    await expect(fixture.service.import({ provider: 'anilist', externalId: '42', title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading' })).rejects.toMatchObject({ code: 'METADATA_PROBABLE_DUPLICATE' })
    await expect(fixture.service.import({ provider: 'anilist', externalId: '42', title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading', allowProbableDuplicate: true })).resolves.toMatchObject({ work: { title: 'Nano Machine' } })
    fixture.db.close()
  })

  it('atualiza campos remotos e preserva overrides do usuário', async () => {
    const fixture = setup()
    const imported = await fixture.service.import({ provider: 'anilist', externalId: '42', title: 'Nano Machine', mediaType: 'manhwa', userStatus: 'reading' })
    fixture.services.works.updateWork({ id: imported.work.id, title: 'Meu título' })
    fixture.setMetadata({ ...base, title: 'Nano Machine Reloaded', description: 'Nova descrição externa', genres: ['Ação', 'Ficção científica'] })
    const preview = await fixture.service.previewRefresh({ workId: imported.work.id })
    expect(preview.changes.find((item) => item.field === 'title')?.protected).toBe(true)
    const result = await fixture.service.applyRefresh({ workId: imported.work.id })
    expect(result.details.work.title).toBe('Meu título')
    expect(result.details.work.description).toBe('Nova descrição externa')
    expect(result.details.genres.map((item) => item.name)).toContain('Ficção científica')
    fixture.db.close()
  })
})
