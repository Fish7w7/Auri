import { DomainError } from '@shared/errors/domain-error'
import { withAbsoluteDeadline } from '../external-request-deadline'
import { assertPublicHttpUrl } from './url-safety'
import type { FetchedPage, HostResolver, PageTransport } from './types'

export const PAGE_FETCH_LIMITS = { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024, maxRedirects: 5 } as const
export interface PageFetchLimits { timeoutMs: number; maxBytes: number; maxRedirects: number }
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml'])

export class SafePageFetcher {
  constructor(
    private readonly transport: PageTransport,
    private readonly resolver?: HostResolver,
    private readonly limits: PageFetchLimits = PAGE_FETCH_LIMITS
  ) {}

  async fetch(rawUrl: string): Promise<FetchedPage> {
    const deadline = Date.now() + this.limits.timeoutMs
    const timeoutError = () => new DomainError('URL_FETCH_TIMEOUT', 'A página demorou demais para responder.')
    const requested = await withAbsoluteDeadline(assertPublicHttpUrl(rawUrl, this.resolver), deadline, timeoutError)
    let current = requested

    for (let redirects = 0; redirects <= this.limits.maxRedirects; redirects += 1) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new DomainError('URL_FETCH_TIMEOUT', 'A página demorou demais para responder.')
      const response = await withAbsoluteDeadline(
        this.transport.request(current.toString(), { maxBytes: this.limits.maxBytes, timeoutMs: remainingMs }),
        deadline,
        timeoutError
      )
      if (REDIRECT_STATUS.has(response.statusCode)) {
        const location = response.headers.location
        if (!location) throw new DomainError('URL_FETCH_FAILED', 'O site retornou um redirecionamento inválido.')
        if (redirects === this.limits.maxRedirects) {
          throw new DomainError('URL_TOO_MANY_REDIRECTS', 'A página excedeu o limite de redirecionamentos.')
        }
        try {
          current = await withAbsoluteDeadline(assertPublicHttpUrl(new URL(location, current).toString(), this.resolver), deadline, timeoutError)
        } catch (error) {
          if (error instanceof DomainError && error.code === 'URL_FETCH_TIMEOUT') throw error
          throw new DomainError('URL_REDIRECT_BLOCKED', 'O redirecionamento apontou para um destino não permitido.')
        }
        continue
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (response.statusCode === 404) throw new DomainError('URL_NOT_FOUND', 'A página informada não foi encontrada.')
        if (response.statusCode === 403) throw new DomainError('URL_ACCESS_DENIED', 'O site não permitiu acessar esta página.')
        if (response.statusCode >= 500) throw new DomainError('URL_SERVER_ERROR', 'O site está com um problema temporário.')
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
