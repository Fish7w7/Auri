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
    const staleBefore = now.getTime() - 30 * 24 * 60 * 60 * 1000
    const reading = this.works.queryActive({ userStatuses: ['reading'], sort: 'last_read_desc' })
    return {
      continueReading: reading.slice(0, 8),
      staleReading: reading
        .filter((work) => work.lastReadAt && Date.parse(work.lastReadAt) < staleBefore)
        .sort((a, b) => Date.parse(a.lastReadAt!) - Date.parse(b.lastReadAt!))
        .slice(0, 8),
      waiting: this.works.queryActive({ userStatuses: ['waiting'], sort: 'last_read_desc' }).slice(0, 8),
      recentlyAdded: this.works.queryActive({ sort: 'created_desc' }).slice(0, 8)
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
