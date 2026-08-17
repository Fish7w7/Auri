import { DomainError } from '@shared/errors/domain-error'
import { assertPublicHttpUrl } from './url-safety'
import type { FetchedPage, HostResolver, PageTransport } from './types'

export const PAGE_FETCH_LIMITS = { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 5 } as const
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml'])

export class SafePageFetcher {
  constructor(
    private readonly transport: PageTransport,
    private readonly resolver?: HostResolver,
    private readonly limits = PAGE_FETCH_LIMITS
  ) {}

  async fetch(rawUrl: string): Promise<FetchedPage> {
    const requested = await assertPublicHttpUrl(rawUrl, this.resolver)
    let current = requested
    const deadline = Date.now() + this.limits.timeoutMs

    for (let redirects = 0; redirects <= this.limits.maxRedirects; redirects += 1) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new DomainError('URL_FETCH_TIMEOUT', 'A página demorou demais para responder.')
      const response = await this.transport.request(current.toString(), { maxBytes: this.limits.maxBytes, timeoutMs: remainingMs })
      if (REDIRECT_STATUS.has(response.statusCode)) {
        const location = response.headers.location
        if (!location) throw new DomainError('URL_FETCH_FAILED', 'O site retornou um redirecionamento inválido.')
        if (redirects === this.limits.maxRedirects) {
          throw new DomainError('URL_TOO_MANY_REDIRECTS', 'A página excedeu o limite de redirecionamentos.')
        }
        try {
          current = await assertPublicHttpUrl(new URL(location, current).toString(), this.resolver)
        } catch {
          throw new DomainError('URL_REDIRECT_BLOCKED', 'O redirecionamento apontou para um destino não permitido.')
        }
        continue
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new DomainError('URL_FETCH_FAILED', 'O site não permitiu obter esta página.')
      }
      const contentType = response.headers['content-type']?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US') || null
      const html = response.body.toString('utf8')
      const looksLikeHtml = /^\s*(?:<!doctype\s+html|<html|<head|<meta|<title)/i.test(html)
      if ((contentType && !HTML_TYPES.has(contentType)) || (!contentType && !looksLikeHtml && html.length > 0)) {
        throw new DomainError('URL_UNSUPPORTED_CONTENT', 'A URL não retornou uma página HTML compatível.')
      }
      return { requestedUrl: requested.toString(), finalUrl: current.toString(), contentType, html }
    }
    throw new DomainError('URL_TOO_MANY_REDIRECTS', 'A página excedeu o limite de redirecionamentos.')
  }
}
