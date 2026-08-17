import { net } from 'electron'
import { DomainError } from '@shared/errors/domain-error'
import type { PageTransport, PageTransportResponse } from './types'

export class ElectronPageTransport implements PageTransport {
  async request(url: string, { maxBytes, timeoutMs }: { maxBytes: number; timeoutMs: number }): Promise<PageTransportResponse> {
    if (!net.isOnline()) throw new DomainError('URL_FETCH_FAILED', 'A página não está disponível offline.')
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    try {
      const response = await net.fetch(url, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml;q=0.9' }
      })
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => { headers[key.toLocaleLowerCase('en-US')] = value })
      const declared = Number(headers['content-length'] ?? '0')
      if (Number.isFinite(declared) && declared > maxBytes) {
        controller.abort()
        throw new DomainError('URL_RESPONSE_TOO_LARGE', 'A página excede o limite permitido.')
      }
      if (!response.body || [301, 302, 303, 307, 308].includes(response.status)) {
        return { statusCode: response.status, headers, body: Buffer.alloc(0) }
      }
      const chunks: Buffer[] = []
      let size = 0
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) {
          controller.abort()
          throw new DomainError('URL_RESPONSE_TOO_LARGE', 'A página excede o limite permitido.')
        }
        chunks.push(Buffer.from(value))
      }
      return { statusCode: response.status, headers, body: Buffer.concat(chunks, size) }
    } catch (error) {
      if (error instanceof DomainError) throw error
      if (timedOut) throw new DomainError('URL_FETCH_TIMEOUT', 'A página demorou demais para responder.')
      throw new DomainError('URL_FETCH_FAILED', 'Não foi possível acessar a página informada.')
    } finally {
      clearTimeout(timeout)
    }
  }
}
