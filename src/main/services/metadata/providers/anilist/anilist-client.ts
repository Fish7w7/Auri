import { DomainError } from '@shared/errors/domain-error'
import type { GraphqlTransport } from '../../types'
import { ANILIST_ENDPOINT } from './queries'

export class AniListClient {
  private blockedUntil = 0
  constructor(private readonly transport: GraphqlTransport, private readonly now: () => number = Date.now) {}

  async query(query: string, variables: Record<string, unknown>): Promise<unknown> {
    if (!this.transport.isOnline()) throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'A pesquisa online não está disponível offline.')
    if (this.now() < this.blockedUntil) throw new DomainError('METADATA_RATE_LIMITED', 'O AniList está limitando novas consultas temporariamente.')
    let response
    try { response = await this.transport.post(ANILIST_ENDPOINT, { query, variables }) }
    catch (error) { if (error instanceof DomainError) throw error; throw new DomainError('METADATA_PROVIDER_UNAVAILABLE', 'Não foi possível acessar o AniList agora.') }
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
