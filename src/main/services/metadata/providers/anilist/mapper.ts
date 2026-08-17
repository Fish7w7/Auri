import type { MediaType, PublicationStatus } from '@shared/types/domain'
import type { MetadataAlias, MetadataCreator, MetadataSearchResult, MetadataWork } from '@shared/contracts'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { AniListDetailedMedia, AniListMedia } from './schemas'

function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null } catch { return null }
}

function titleFor(media: AniListMedia): string | null { return media.title.english ?? media.title.romaji ?? media.title.native }
function fuzzyDate(value: { year: number | null; month: number | null; day: number | null }): string | null {
  if (!value.year) return null
  if (!value.month) return String(value.year)
  if (!value.day) return `${value.year}-${String(value.month).padStart(2, '0')}`
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

export function mapAniListMediaType(format: string | null, country: string | null): MediaType | null {
  if (format === 'NOVEL') return 'novel'
  if (format !== 'MANGA' && format !== 'ONE_SHOT') return null
  if (country === 'JP') return 'manga'
  if (country === 'KR') return 'manhwa'
  if (country === 'CN' || country === 'TW') return 'manhua'
  return 'other'
}

export function mapAniListPublicationStatus(status: string | null): PublicationStatus | null {
  return ({ RELEASING: 'ongoing', FINISHED: 'completed', HIATUS: 'hiatus', CANCELLED: 'cancelled', NOT_YET_RELEASED: 'unknown' } as const)[status ?? ''] ?? null
}

export function sanitizeExternalDescription(value: string | null): string | null {
  if (!value) return null
  const decoded = value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`>#]/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return decoded || null
}

function aliasesFor(media: AniListDetailedMedia, primary: string): MetadataAlias[] {
  const entries: MetadataAlias[] = [
    ...(media.title.english ? [{ name: media.title.english, kind: 'english' as const }] : []),
    ...(media.title.romaji ? [{ name: media.title.romaji, kind: 'romaji' as const }] : []),
    ...(media.title.native ? [{ name: media.title.native, kind: 'native' as const }] : []),
    ...media.synonyms.map((name) => ({ name, kind: 'synonym' as const }))
  ]
  const seen = new Set([normalizeSearchText(primary)])
  return entries.map((entry) => ({ ...entry, name: entry.name.trim() })).filter((entry) => { const key = normalizeSearchText(entry.name); if (!key || seen.has(key)) return false; seen.add(key); return true })
}

function creatorsFor(media: AniListDetailedMedia): MetadataCreator[] {
  const result: MetadataCreator[] = []
  const seen = new Set<string>()
  for (const edge of media.staff.edges) {
    const roleText = edge.role.toLocaleLowerCase('en-US')
    const roles: MetadataCreator['role'][] = []
    if (/original creator/.test(roleText)) roles.push('original_creator')
    else {
      if (/story|script|writer/.test(roleText)) roles.push('author')
      if (/art|illustrat/.test(roleText)) roles.push('artist')
    }
    for (const role of roles) { const key = `${normalizeSearchText(edge.node.name.full)}:${role}`; if (!seen.has(key)) { seen.add(key); result.push({ name: edge.node.name.full, role }) } }
  }
  return result
}

export function mapAniListSearchResult(media: AniListMedia): MetadataSearchResult | null {
  const title = titleFor(media)
  if (!title) return null
  return { provider: 'anilist', externalId: String(media.id), title, originalTitle: media.title.native,
    mediaType: mapAniListMediaType(media.format, media.countryOfOrigin), publicationStatus: mapAniListPublicationStatus(media.status),
    countryCode: media.countryOfOrigin, startDate: fuzzyDate(media.startDate), coverUrl: safeUrl(media.coverImage?.extraLarge ?? media.coverImage?.large), canonicalUrl: safeUrl(media.siteUrl) }
}

export function mapAniListDetails(media: AniListDetailedMedia): MetadataWork | null {
  const title = titleFor(media)
  if (!title) return null
  return { provider: 'anilist', externalId: String(media.id), title, originalTitle: media.title.native,
    aliases: aliasesFor(media, title), description: sanitizeExternalDescription(media.description),
    mediaType: mapAniListMediaType(media.format, media.countryOfOrigin), publicationStatus: mapAniListPublicationStatus(media.status),
    countryCode: media.countryOfOrigin, startDate: fuzzyDate(media.startDate), endDate: fuzzyDate(media.endDate),
    creators: creatorsFor(media), genres: [...new Set(media.genres.map((genre) => genre.trim()).filter(Boolean))],
    coverUrl: safeUrl(media.coverImage?.extraLarge ?? media.coverImage?.large), canonicalUrl: safeUrl(media.siteUrl) }
}
