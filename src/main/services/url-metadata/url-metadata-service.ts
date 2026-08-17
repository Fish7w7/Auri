import type { UrlMetadataAnalysis, UrlMetadataDuplicate } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { urlMetadataAnalyzeSchema, urlMetadataDuplicateSchema } from '@shared/schemas/domain'
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { SourceRepository } from '../../database/repositories/source-repository'
import type { WorkRepository } from '../../database/repositories/work-repository'
import type { Logger } from '../../logging/logger'
import { parseDomainInput } from '../service-utils'
import { extractPageMetadata } from './page-metadata-extractor'
import type { SafePageFetcher } from './safe-page-fetcher'
import { assertPublicHttpUrl, isBlockedDestination, parseAllowedHttpUrl } from './url-safety'

export class UrlMetadataService {
  constructor(
    private readonly fetcher: SafePageFetcher,
    private readonly works: WorkRepository,
    private readonly sources: SourceRepository,
    private readonly logger: Logger
  ) {}

  async analyze(input: unknown): Promise<UrlMetadataAnalysis> {
    const { url } = parseDomainInput(urlMetadataAnalyzeSchema, input)
    const startedAt = Date.now()
    let domain = safeDomain(url)
    this.logger.info('metadata', 'Análise de URL iniciada.', { event: 'url_metadata.started', domain })
    try {
      const page = await this.fetcher.fetch(url)
      const metadata = extractPageMetadata(page.html, page.requestedUrl, page.finalUrl)
      if (metadata.coverUrl) {
        try { metadata.coverUrl = (await assertPublicHttpUrl(metadata.coverUrl)).toString() }
        catch { metadata.coverUrl = null }
      }
      domain = metadata.domain
      const duplicate = this.findDuplicate(
        [metadata.requestedUrl, metadata.finalUrl, metadata.canonicalUrl].filter((value): value is string => Boolean(value)),
        metadata.title
      )
      this.logger.info('metadata', 'Análise de URL concluída.', {
        event: 'url_metadata.completed', domain, durationMs: Date.now() - startedAt,
        hasTitle: Boolean(metadata.title), hasCover: Boolean(metadata.coverUrl), hasDescription: Boolean(metadata.description)
      })
      return { metadata, duplicate }
    } catch (error) {
      const errorCode = error instanceof DomainError ? error.code : 'URL_FETCH_FAILED'
      this.logger.warn('metadata', 'Análise de URL não concluída.', {
        event: 'url_metadata.failed', domain, durationMs: Date.now() - startedAt, errorCode
      })
      if (error instanceof DomainError) throw error
      throw new DomainError('URL_FETCH_FAILED', 'Não foi possível analisar a página informada.')
    }
  }

  checkDuplicate(input: unknown): UrlMetadataDuplicate | null {
    const request = parseDomainInput(urlMetadataDuplicateSchema, input)
    const parsed = parseAllowedHttpUrl(request.url)
    if (isBlockedDestination(parsed.hostname)) {
      throw new DomainError('URL_DESTINATION_BLOCKED', 'Este destino local ou privado não pode ser usado como fonte.')
    }
    return this.findDuplicate([parsed.toString()], request.title ?? null)
  }

  private findDuplicate(urls: string[], title: string | null): UrlMetadataDuplicate | null {
    const normalizedUrls = new Set(urls.map((url) => normalizeSourceUrl(url)).filter((value): value is string => Boolean(value)))
    if (!normalizedUrls.size) throw new DomainError('URL_INVALID', 'Informe uma URL válida.')
    const existingSource = this.sources.listAll().find((source) =>
      [source.seriesUrl, source.lastReadUrl].map((value) => normalizeSourceUrl(value))
        .some((value) => value !== null && normalizedUrls.has(value))
    )
    if (existingSource) {
      const work = this.works.findById(existingSource.workId)
      if (work) return { kind: 'source', work, source: existingSource }
    }
    if (title) {
      const work = this.works.findByNormalizedTitleOrAlias(normalizeSearchText(title))
      if (work) return { kind: 'work', work }
    }
    return null
  }
}

function safeDomain(value: string): string | null {
  try { return new URL(value).hostname.toLocaleLowerCase('en-US') || null } catch { return null }
}
