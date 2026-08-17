import { DomainError } from '@shared/errors/domain-error'
import type { MetadataProvider } from '../../types'
import { DETAILS_QUERY, SEARCH_QUERY } from './queries'
import { detailsDataSchema, searchDataSchema } from './schemas'
import { mapAniListDetails, mapAniListSearchResult } from './mapper'
import type { AniListClient } from './anilist-client'

export class AniListProvider implements MetadataProvider {
  readonly id = 'anilist'
  constructor(private readonly client: AniListClient) {}
  async search(query: string) {
    const data = await this.client.query(SEARCH_QUERY, { search: query, perPage: 8 })
    const parsed = searchDataSchema.safeParse(data)
    if (!parsed.success) throw new DomainError('METADATA_INVALID_RESPONSE', 'O AniList retornou resultados inválidos.')
    return parsed.data.Page.media.map(mapAniListSearchResult).filter((item) => item !== null)
  }
  async getById(externalId: string) {
    const id = Number(externalId)
    if (!Number.isSafeInteger(id) || id <= 0) throw new DomainError('METADATA_NOT_FOUND', 'Obra não encontrada no AniList.')
    const data = await this.client.query(DETAILS_QUERY, { id })
    const parsed = detailsDataSchema.safeParse(data)
    if (!parsed.success) throw new DomainError('METADATA_INVALID_RESPONSE', 'O AniList retornou metadados inválidos.')
    return parsed.data.Media ? mapAniListDetails(parsed.data.Media) : null
  }
}
