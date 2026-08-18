import type {
  HomeData,
  LibraryQuery,
  LibrarySummary,
  ListWorksRequest,
  SearchLibraryRequest
} from '@shared/contracts'
import { libraryQuerySchema, listWorksSchema, searchLibrarySchema } from '@shared/schemas/domain'
import type { Work } from '@shared/types/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { WorkRepository } from '../database/repositories/work-repository'
import { parseDomainInput } from './service-utils'

export class LibraryService {
  constructor(private readonly works: WorkRepository) {}

  listWorks(input?: unknown): Work[] {
    const request = parseDomainInput(listWorksSchema, input) as ListWorksRequest
    return this.works.queryActive(this.normalizeQuery(request ?? {}))
  }

  searchWorks(input: unknown): Work[] {
    const request = parseDomainInput(searchLibrarySchema, input) as SearchLibraryRequest
    return this.works.queryActive(
      this.normalizeQuery({
        ...request,
        search: request.query
      })
    )
  }

  queryWorks(input?: unknown): Work[] {
    const request = parseDomainInput(libraryQuerySchema, input ?? {}) as LibraryQuery
    return this.works.queryActive(this.normalizeQuery(request))
  }

  getSummary(): LibrarySummary {
    return this.works.getSummary()
  }

  getHome(now = new Date()): HomeData {
    const staleBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const limit = 6
    return {
      continueReading: this.works.listHomeReading(staleBefore, false, limit),
      staleReading: this.works.listHomeReading(staleBefore, true, limit),
      waiting: this.works.listHomeWaiting(limit),
      recentlyAdded: this.works.listHomeRecentlyAdded(limit)
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
