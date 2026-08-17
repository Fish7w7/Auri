import Database from 'better-sqlite3'
import { AliasRepository } from '@main/database/repositories/alias-repository'
import { CollectionRepository } from '@main/database/repositories/collection-repository'
import { CreatorRepository } from '@main/database/repositories/creator-repository'
import { ExternalRefRepository } from '@main/database/repositories/external-ref-repository'
import { GenreRepository } from '@main/database/repositories/genre-repository'
import { HistoryRepository } from '@main/database/repositories/history-repository'
import { MetadataOverrideRepository } from '@main/database/repositories/metadata-override-repository'
import { SourceRepository } from '@main/database/repositories/source-repository'
import { TagRepository } from '@main/database/repositories/tag-repository'
import { WorkRepository } from '@main/database/repositories/work-repository'
import { createMigrations } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { LibraryService } from '@main/services/library-service'
import { ProgressService } from '@main/services/progress-service'
import { SourceService } from '@main/services/source-service'
import { WorkService } from '@main/services/work-service'
import { WorkDetailsService } from '@main/services/work-details-service'
import { TestLogger } from './test-logger'

export function createDomainFixture(databasePath = ':memory:') {
  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')
  new MigrationRunner(db, new TestLogger(), createMigrations(db)).run()

  let timestamp = Date.parse('2026-08-17T16:41:32.218Z')
  const clock = () => new Date(timestamp++).toISOString()

  const repositories = {
    works: new WorkRepository(db),
    aliases: new AliasRepository(db),
    externalRefs: new ExternalRefRepository(db),
    history: new HistoryRepository(db),
    sources: new SourceRepository(db),
    creators: new CreatorRepository(db),
    genres: new GenreRepository(db),
    tags: new TagRepository(db),
    collections: new CollectionRepository(db),
    overrides: new MetadataOverrideRepository(db)
  }

  const services = {
    works: new WorkService(
      db,
      {
        works: repositories.works,
        aliases: repositories.aliases,
        externalRefs: repositories.externalRefs,
        history: repositories.history,
        overrides: repositories.overrides
      },
      clock
    ),
    progress: new ProgressService(
      db,
      repositories.works,
      repositories.history,
      repositories.sources,
      clock
    ),
    sources: new SourceService(db, repositories.sources, repositories.works, clock),
    library: new LibraryService(repositories.works),
    details: undefined as unknown as WorkDetailsService
  }

  services.details = new WorkDetailsService(db, {
    works: repositories.works, aliases: repositories.aliases, creators: repositories.creators,
    genres: repositories.genres, tags: repositories.tags, collections: repositories.collections,
    sources: repositories.sources, overrides: repositories.overrides, externalRefs: repositories.externalRefs
  }, services.works, services.sources, clock)

  return { db, clock, repositories, services }
}

export function createMinimalWork(
  fixture: ReturnType<typeof createDomainFixture>,
  title = 'Nano Machine',
  chapter?: string
) {
  return fixture.services.works.createWork({
    title,
    mediaType: 'manhwa',
    userStatus: 'reading',
    ...(chapter ? { chapter } : {})
  })
}
