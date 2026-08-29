import { net } from 'electron'
import { DomainError } from '@shared/errors/domain-error'
import { withAbsoluteDeadline } from '../external-request-deadline'
import { assertPublicHttpUrl } from '../url-metadata/url-safety'
import type { HostResolver } from '../url-metadata/types'
import type { CoverDownloadClient } from './types'

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
type CoverFetch = (url: string, init: RequestInit) => Promise<Response>

export class ElectronCoverClient implements CoverDownloadClient {
  constructor(
    private readonly resolver?: HostResolver,
    private readonly fetcher: CoverFetch = (url, init) => net.fetch(url, init),
    private readonly online: () => boolean = () => net.isOnline()
  ) {}

  isOnline(): boolean { return this.online() }
  async download(url: string, { maxBytes, timeoutMs, maxRedirects }: { maxBytes: number; timeoutMs: number; maxRedirects: number }): Promise<Buffer> {
    if (!this.isOnline()) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A capa não está disponível offline.', { transient: true })
    const controller = new AbortController()
    const deadline = Date.now() + timeoutMs
    const timeoutError = () => new DomainError('COVER_TIMEOUT', 'O download da capa excedeu o tempo limite.')
    try {
      let current = await withAbsoluteDeadline(assertPublicHttpUrl(url, this.resolver), deadline, timeoutError, () => controller.abort())
      let response: Response | null = null
      for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
        response = await withAbsoluteDeadline(this.fetcher(current.toString(), {
          method: 'GET', redirect: 'manual', credentials: 'omit', signal: controller.signal,
          headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9' }
        }), deadline, timeoutError, () => controller.abort())
        if (!REDIRECT_STATUS.has(response.status)) break
        const location = response.headers.get('location')
        if (!location) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A capa retornou um redirecionamento inválido.')
        if (redirects === maxRedirects) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A capa excedeu o limite de redirecionamentos.')
        current = await withAbsoluteDeadline(
          assertPublicHttpUrl(new URL(location, current).toString(), this.resolver),
          deadline,
          timeoutError,
          () => controller.abort()
        )
      }
      if (!response || !response.ok) {
        const httpStatus = response?.status ?? 0
        throw new DomainError('COVER_DOWNLOAD_FAILED', 'Não foi possível baixar a capa.', {
          httpStatus,
          transient: httpStatus === 429 || httpStatus >= 500
        })
      }
      const declared = Number(response.headers.get('content-length') ?? '0')
      if (declared > maxBytes) throw new DomainError('COVER_TOO_LARGE', 'A capa remota excede o limite permitido.')
      if (!response.body) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A resposta da capa está vazia.')
      const chunks: Uint8Array[] = []
      let size = 0
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) { controller.abort(); throw new DomainError('COVER_TOO_LARGE', 'A capa remota excede o limite permitido.') }
        chunks.push(value)
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size)
    } catch (error) {
      if (error instanceof DomainError) throw error
      if (controller.signal.aborted) throw new DomainError('COVER_TIMEOUT', 'O download da capa excedeu o tempo limite.')
      throw new DomainError('COVER_DOWNLOAD_FAILED', 'Não foi possível baixar a capa.', { transient: true })
    }
  }
}
