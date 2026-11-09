import type {
  HomeData,
  HomeRequest,
  LibraryQuery,
  LibrarySummary,
  ListWorksRequest,
  SearchLibraryRequest
} from '@shared/contracts'
import { homeRequestSchema, libraryQuerySchema, listWorksSchema, searchLibrarySchema } from '@shared/schemas/domain'
import { readingStatisticsSchema } from '@shared/schemas/reading-statistics'
import type { Source, Work } from '@shared/types/domain'
import { summarizeReadingSources } from '@shared/reading-sources'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { WorkRepository } from '../database/repositories/work-repository'
import type { CollectionRepository } from '../database/repositories/collection-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import { parseDomainInput } from './service-utils'

export class LibraryService {
  constructor(private readonly works: WorkRepository, private readonly collections: CollectionRepository, private readonly sources: SourceRepository) {}

  listWorks(input?: unknown): Work[] {
    const request = parseDomainInput(listWorksSchema, input) as ListWorksRequest
    return this.works.queryActive(this.normalizeQuery(request ?? {}))
  }

  searchWorks(input: unknown): Work[] {
    const request = parseDomainInput(searchLibrarySchema, input) as SearchLibraryRequest
    const normalizedQuery = normalizeSearchText(request.query)
    const { query: _query, recentWorkIds, ...filters } = request
    return this.works.searchActive(normalizedQuery, recentWorkIds, this.normalizeQuery({ ...filters, search: normalizedQuery }))
  }

  queryWorks(input?: unknown): Work[] {
    const request = parseDomainInput(libraryQuerySchema, input ?? {}) as LibraryQuery
    return this.works.queryActive(this.normalizeQuery(request))
  }

  getSummary(): LibrarySummary {
    return this.works.getSummary()
  }

  getStatistics(input: unknown, now = new Date()) {
    return this.works.getReadingStatistics(parseDomainInput(readingStatisticsSchema, input), now)
  }

  getHome(input?: unknown): HomeData {
    const request = parseDomainInput(homeRequestSchema, input ?? {}) as HomeRequest
    const limit = 8
    const pinnedCollections = request.pinnedCollectionIds.flatMap((id) => {
      const collection = this.collections.findById(id)
      return collection ? [{ collection, works: this.works.queryActive({ collectionIds: [id], hiddenFromHome: false, limit }) }] : []
    })
    const continueReading = this.works.listHomeContinueReading(limit)
    const sourcesByWork = new Map<string, Source[]>()
    for (const source of this.sources.listByWorkIds(continueReading.map((work) => work.id))) {
      const sources = sourcesByWork.get(source.workId) ?? []
      sources.push(source)
      sourcesByWork.set(source.workId, sources)
    }
    return {
      continueReading,
      reading: Object.fromEntries(continueReading.map((work) => [work.id, summarizeReadingSources(sourcesByWork.get(work.id) ?? [], work.lastReadAt)])),
      recent: this.works.listHomeRecent(request.recentWorkIds, limit, request.includeHiddenRecent),
      favorites: this.works.listHomeFavorites(request.recentWorkIds, limit),
      recentlyAdded: this.works.listHomeRecentlyAdded(limit),
      pinnedCollections
    }
  }

  private normalizeQuery(query: LibraryQuery): LibraryQuery {
    return {
      ...query,
      search: query.search ? normalizeSearchText(query.search) : undefined,
      sort: query.sort ?? 'last_read_desc'
    }
  }
}
