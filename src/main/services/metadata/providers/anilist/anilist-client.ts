import { DomainError } from '@shared/errors/domain-error'
import type { GraphqlTransport } from '../../types'
import { ANILIST_ENDPOINT } from './queries'

export const ANILIST_REQUEST_TIMEOUT_MS = 15_000

export class AniListClient {
  private blockedUntil = 0
  constructor(private readonly transport: GraphqlTransport, private readonly now: () => number = Date.now) {}

  async query(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (!this.transport.isOnline()) throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Sem conexão com a internet. Verifique sua conexão e tente novamente.', { offline: true })
    if (this.now() < this.blockedUntil) throw new DomainError('METADATA_RATE_LIMITED', 'O AniList está limitando novas consultas temporariamente.')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let onCancel: (() => void) | undefined
    const interruption = new Promise<never>((_resolve, reject) => {
      onCancel = () => {
        controller.abort()
        reject(new DomainError('METADATA_REQUEST_CANCELLED', 'A consulta ao AniList foi cancelada.'))
      }
      if (signal?.aborted) onCancel()
      else signal?.addEventListener('abort', onCancel, { once: true })
      timer = setTimeout(() => {
        controller.abort()
        reject(new DomainError('METADATA_TIMEOUT', 'O AniList demorou demais para responder.'))
      }, ANILIST_REQUEST_TIMEOUT_MS)
    })
    let response
    try {
      response = await Promise.race([
        this.transport.post(ANILIST_ENDPOINT, { query, variables }, controller.signal),
        interruption
      ])
    } catch (error) {
      if (error instanceof DomainError) throw error
      if (signal?.aborted) throw new DomainError('METADATA_REQUEST_CANCELLED', 'A consulta ao AniList foi cancelada.')
      throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Não foi possível acessar o AniList agora.')
    } finally {
      if (timer) clearTimeout(timer)
      if (onCancel) signal?.removeEventListener('abort', onCancel)
    }
    if (response.status === 429) {
      const retrySeconds = Number(response.headers['retry-after'] ?? '60')
      this.blockedUntil = this.now() + (Number.isFinite(retrySeconds) ? retrySeconds : 60) * 1000
      throw new DomainError('METADATA_RATE_LIMITED', 'O AniList está limitando novas consultas temporariamente.', { retryAfterSeconds: retrySeconds })
    }
    if (response.status < 200 || response.status >= 300) throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'O AniList está indisponível no momento.')
    let body: unknown
    try { body = await response.json() } catch { throw new DomainError('METADATA_INVALID_RESPONSE', 'O AniList retornou uma resposta inválida.') }
    if (!body || typeof body !== 'object') throw new DomainError('METADATA_INVALID_RESPONSE', 'O AniList retornou uma resposta inválida.')
    const record = body as { data?: unknown; errors?: Array<{ message?: string; status?: number }> }
    if (record.errors?.length) {
      if (record.errors.some((error) => error.status === 429)) { this.blockedUntil = this.now() + 60_000; throw new DomainError('METADATA_RATE_LIMITED', 'O AniList está limitando novas consultas temporariamente.') }
      throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'O AniList não conseguiu concluir a consulta.')
    }
    if (record.data === undefined) throw new DomainError('METADATA_INVALID_RESPONSE', 'O AniList retornou uma resposta inválida.')
    return record.data
  }
}
