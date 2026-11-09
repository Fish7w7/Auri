import { join } from 'node:path'
import { createBrowserExtensionService } from '../services/create-browser-extension-service'
import type { BrowserExtensionService } from '../services/browser-extension-service'
import type { App } from 'electron'
import { AliasRepository } from '../database/repositories/alias-repository'
import { CollectionRepository } from '../database/repositories/collection-repository'
import { CreatorRepository } from '../database/repositories/creator-repository'
import { ExternalRefRepository } from '../database/repositories/external-ref-repository'
import { GenreRepository } from '../database/repositories/genre-repository'
import { HistoryRepository } from '../database/repositories/history-repository'
import { MetadataOverrideRepository } from '../database/repositories/metadata-override-repository'
import { SourceRepository } from '../database/repositories/source-repository'
import { assertDatabaseSchemaSupported, openDatabase, type DatabaseConnection } from '../database/connection/database-connection'
import { createMigrations, SUPPORTED_SCHEMA_VERSION } from '../database/migrations'
import { MigrationRunner } from '../database/migrations/migration-runner'
import { SystemRepository } from '../database/repositories/system-repository'
import { TagRepository } from '../database/repositories/tag-repository'
import { WorkRepository } from '../database/repositories/work-repository'
import { JsonLogger, type Logger } from '../logging/logger'
import { LibraryService } from '../services/library-service'
import { ProgressService } from '../services/progress-service'
import { SourceService } from '../services/source-service'
import { SettingsService } from '../services/settings-service'
import { SystemService } from '../services/system-service'
import { UpdateService, type UpdaterAdapter } from '../services/update-service'
import { WorkService } from '../services/work-service'
import { WorkDetailsService } from '../services/work-details-service'
import { AssetService } from '../services/asset-service'
import { ExternalNavigationService } from '../services/external-navigation-service'
import { CoverService } from '../services/covers/cover-service'
import { ElectronCoverClient } from '../services/covers/electron-cover-client'
import type { CoverDownloadClient } from '../services/covers/types'
import { MetadataService } from '../services/metadata/metadata-service'
import { ElectronGraphqlTransport } from '../services/metadata/electron-graphql-transport'
import { AniListClient } from '../services/metadata/providers/anilist/anilist-client'
import { AniListProvider } from '../services/metadata/providers/anilist/anilist-provider'
import type { MetadataProvider } from '../services/metadata/types'
import { resolveDataPaths } from './data-paths'
import { BackupService } from '../services/backup/backup-service'
import { TransferService } from '../services/transfer-service'
import { CriticalOperationCoordinator } from '../services/critical-operation-coordinator'
import { runMigrationsSafely } from '../database/migrations/safe-migration-runner'
import { ElectronPageTransport } from '../services/url-metadata/electron-page-transport'
import { SafePageFetcher } from '../services/url-metadata/safe-page-fetcher'
import { UrlMetadataService } from '../services/url-metadata/url-metadata-service'
import { BulkLibraryService } from '../services/bulk-library-service'
import { CURRENT_LOG_FILE_NAME } from './app-identity'
import { createApplicationUpdateService } from '../services/application-update-service'
import { WorkResolutionRepository } from '../database/repositories/work-resolution-repository'
import { WorkResolutionService } from '../services/work-resolution-service'
import { SourceIdentityService } from '../services/source-identity-service'
import { WorkContextService } from '../services/work-context-service'
import { WorkEquivalenceService } from '../services/work-equivalence-service'
import { WorkMergeService } from '../services/work-merge-service'
import { assertE2EUserData } from './e2e-user-data'

export interface AppContext {
  readonly database: DatabaseConnection
  readonly logger: Logger
  readonly services: {
    browserExtension: BrowserExtensionService
    system: SystemService
    updates: UpdateService
    works: WorkService
    progress: ProgressService
    sources: SourceService
    library: LibraryService
    settings: SettingsService
    details: WorkDetailsService
    assets: AssetService
    covers: CoverService
    metadata: MetadataService
    urlMetadata: UrlMetadataService
    externalNavigation: ExternalNavigationService
    backups: BackupService
    transfer: TransferService
    bulk: BulkLibraryService
    resolution: WorkResolutionService
    workContext: WorkContextService
    workMerge: WorkMergeService
  }
  dispose(): void
}

export interface CreateAppContextOptions {
  metadataProviders?: MetadataProvider[]
  coverClient?: CoverDownloadClient
  pageFetcher?: SafePageFetcher
  updater?: UpdaterAdapter
  updaterEnvironment?: { isPackaged: boolean; isConfigured: boolean }
}

export async function createAppContext(app: App, options: CreateAppContextOptions = {}): Promise<AppContext> {
  const e2eUserDataPath = assertE2EUserData(app)
  if (e2eUserDataPath) console.info(`[auri:e2e] userData confirmado antes dos serviços: ${e2eUserDataPath}`)
  const paths = resolveDataPaths(app.getPath('userData'))
  const logger = new JsonLogger(join(paths.logs, CURRENT_LOG_FILE_NAME), !app.isPackaged)
  assertDatabaseSchemaSupported(paths.database, SUPPORTED_SCHEMA_VERSION)
  const database = openDatabase(paths.database, logger)

  try {
    const settings = new SettingsService(paths.settings, logger)
    const criticalOperations = new CriticalOperationCoordinator()
    const migrations = createMigrations(database.db)
    const supportedSchemaVersion = migrations.at(-1)?.version ?? 0
    const backups = new BackupService(database.db, paths, settings, logger, app.getVersion(), supportedSchemaVersion, {
      closeDatabase: () => database.close(),
      restartApplication: () => { app.relaunch(); app.exit(0) },
      criticalOperations
    })
    const migrationRunner = new MigrationRunner(
      database.db,
      logger,
      migrations
    )
    await runMigrationsSafely(migrationRunner, backups, logger)

    const systemRepository = new SystemRepository(database.db)
    const worksRepository = new WorkRepository(database.db)
    const aliasesRepository = new AliasRepository(database.db)
    const externalRefsRepository = new ExternalRefRepository(database.db)
    const historyRepository = new HistoryRepository(database.db)
    const sourcesRepository = new SourceRepository(database.db)
    const creatorsRepository = new CreatorRepository(database.db)
    const genresRepository = new GenreRepository(database.db)
    const tagsRepository = new TagRepository(database.db)
    const collectionsRepository = new CollectionRepository(database.db)
    const overridesRepository = new MetadataOverrideRepository(database.db)
    const workResolutionRepository = new WorkResolutionRepository(database.db)
    const workEquivalence = new WorkEquivalenceService(workResolutionRepository)

    const works = new WorkService(database.db, {
      works: worksRepository,
      aliases: aliasesRepository,
      externalRefs: externalRefsRepository,
      history: historyRepository,
      overrides: overridesRepository
    }, workEquivalence)
    const progress = new ProgressService(
      database.db,
      worksRepository,
      historyRepository,
      sourcesRepository
    )
    const sourceIdentity = new SourceIdentityService(sourcesRepository, worksRepository, historyRepository)
    const sources = new SourceService(database.db, sourcesRepository, worksRepository, sourceIdentity)
    const details = new WorkDetailsService(database.db, {
      works: worksRepository, aliases: aliasesRepository, creators: creatorsRepository,
      genres: genresRepository, tags: tagsRepository, collections: collectionsRepository,
      sources: sourcesRepository, overrides: overridesRepository, externalRefs: externalRefsRepository
    }, works, sources, progress)
    const bulk = new BulkLibraryService(database.db, {
      works: worksRepository,
      tags: tagsRepository,
      collections: collectionsRepository
    })
    const assets = new AssetService(paths.assets, works)
    const covers = new CoverService(paths.coverCache, worksRepository, assets, options.coverClient ?? new ElectronCoverClient(), Date.now, logger)
    const system = new SystemService(systemRepository, app.getVersion(), paths, backups, covers, logger, criticalOperations)
    const metadataProviders = options.metadataProviders ?? [new AniListProvider(new AniListClient(new ElectronGraphqlTransport()))]
    const metadata = new MetadataService(database.db, metadataProviders, {
      works: worksRepository, aliases: aliasesRepository, creators: creatorsRepository,
      genres: genresRepository, externalRefs: externalRefsRepository, overrides: overridesRepository
    }, details, covers)
    const urlMetadata = new UrlMetadataService(
      options.pageFetcher ?? new SafePageFetcher(new ElectronPageTransport()),
      worksRepository,
      sourcesRepository,
      logger
    )
    const externalNavigation = new ExternalNavigationService()
    const resolution = new WorkResolutionService(workResolutionRepository, sourceIdentity, workEquivalence)
    const workContext = new WorkContextService(worksRepository, sourcesRepository, sourceIdentity)
    const workMerge = new WorkMergeService(database.db, {
      works: worksRepository,
      sources: sourcesRepository,
      overrides: overridesRepository
    }, sourceIdentity, settings, backups)
    const library = new LibraryService(worksRepository, collectionsRepository, sourcesRepository)
    const transfer = new TransferService(database.db, {
      works: worksRepository, aliases: aliasesRepository, creators: creatorsRepository,
      genres: genresRepository, tags: tagsRepository, collections: collectionsRepository,
      sources: sourcesRepository, history: historyRepository, externalRefs: externalRefsRepository
    }, details, backups, logger)
    const updates = createApplicationUpdateService(app, logger, criticalOperations, options)

    return {
      database,
      logger,
      services: { browserExtension: createBrowserExtensionService(app), system, updates, works, progress, sources, library, settings, details, bulk, resolution, workContext, workMerge, assets, covers, metadata, urlMetadata, externalNavigation, backups, transfer },
      dispose() {
        updates.dispose()
        database.close()
      }
    }
  } catch (error) {
    database.close()
    throw error
  }
}
