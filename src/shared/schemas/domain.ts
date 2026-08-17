import { z } from 'zod'

export const mediaTypeSchema = z.enum([
  'manhwa',
  'manga',
  'manhua',
  'webtoon',
  'novel',
  'light_novel',
  'other'
])

export const userStatusSchema = z.enum([
  'want_to_read',
  'reading',
  'paused',
  'waiting',
  'completed',
  'dropped'
])

export const publicationStatusSchema = z.enum([
  'ongoing',
  'completed',
  'hiatus',
  'cancelled',
  'unknown'
])

export const sourceStatusSchema = z.enum(['active', 'unavailable', 'archived'])
export const coverTypeSchema = z.enum(['none', 'remote', 'custom'])
export const partialDateSchema = z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/)
export const utcTimestampSchema = z.string().datetime({ offset: true })

const nullableText = z.string().trim().min(1).nullable().optional()

export const aliasInputSchema = z.object({
  name: z.string().trim().min(1),
  kind: nullableText,
  source: nullableText
})

export const externalRefInputSchema = z.object({
  provider: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  canonicalUrl: z.string().url().nullable().optional()
})

export const createWorkSchema = z.object({
  title: z.string().trim().min(1),
  mediaType: mediaTypeSchema,
  userStatus: userStatusSchema,
  publicationStatus: publicationStatusSchema.nullable().optional(),
  description: nullableText,
  countryCode: z.string().trim().min(2).max(3).nullable().optional(),
  startDate: partialDateSchema.nullable().optional(),
  endDate: partialDateSchema.nullable().optional(),
  chapter: z.string().nullable().optional(),
  rating: z.number().finite().min(0).max(10).nullable().optional(),
  favorite: z.boolean().optional(),
  notes: nullableText,
  lastReadNote: nullableText,
  cover: z
    .object({
      type: coverTypeSchema,
      sourceUrl: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.').nullable().optional(),
      customPath: nullableText
    })
    .optional(),
  aliases: z.array(aliasInputSchema).optional(),
  externalRefs: z.array(externalRefInputSchema).optional()
})

export const updateWorkSchema = createWorkSchema
  .omit({ chapter: true, aliases: true, externalRefs: true })
  .partial()
  .extend({ id: z.string().uuid() })
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Nenhum campo para atualizar.')

export const workIdSchema = z.object({ workId: z.string().uuid() })
export const historyIdSchema = z.object({ historyId: z.string().uuid() })

export const createSourceSchema = z.object({
  workId: z.string().uuid(),
  name: nullableText,
  domain: z.string().trim().min(1).optional(),
  language: nullableText,
  seriesUrl: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.').nullable().optional(),
  lastReadUrl: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.').nullable().optional(),
  translatorGroup: nullableText,
  status: sourceStatusSchema.optional(),
  isPreferred: z.boolean().optional()
})

export const updateSourceSchema = createSourceSchema
  .omit({ workId: true, isPreferred: true })
  .partial()
  .extend({ id: z.string().uuid() })
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Nenhum campo para atualizar.')

export const sourceIdSchema = z.object({ sourceId: z.string().uuid() })

export const aliasIdSchema = z.object({ aliasId: z.string().uuid() })
export const creatorIdSchema = z.object({ creatorId: z.string().uuid() })
export const genreWorkSchema = z.object({ workId: z.string().uuid(), genreId: z.string().uuid() })
export const tagWorkSchema = z.object({ workId: z.string().uuid(), tagId: z.string().uuid() })
export const collectionWorkSchema = z.object({ workId: z.string().uuid(), collectionId: z.string().uuid() })
export const collectionIdSchema = z.object({ collectionId: z.string().uuid() })

export const creatorInputSchema = z.object({
  name: z.string().trim().min(1),
  role: z.enum(['author', 'artist', 'story', 'original_creator', 'other']),
  source: nullableText
})

export const createAliasSchema = aliasInputSchema.extend({ workId: z.string().uuid() })
export const updateAliasSchema = aliasInputSchema.partial().extend({ id: z.string().uuid() })
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Nenhum campo para atualizar.')
export const createCreatorSchema = creatorInputSchema.extend({ workId: z.string().uuid() })
export const updateCreatorSchema = creatorInputSchema.partial().extend({ id: z.string().uuid() })
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Nenhum campo para atualizar.')
export const createGenreSchema = z.object({ name: z.string().trim().min(1), workId: z.string().uuid().optional() })
export const createTagSchema = z.object({ name: z.string().trim().min(1), workId: z.string().uuid().optional() })
export const createCollectionSchema = z.object({ name: z.string().trim().min(1), description: nullableText, workId: z.string().uuid().optional() })
export const updateCollectionSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).optional(), description: nullableText })
  .refine((value) => Object.keys(value).some((key) => key !== 'id'), 'Nenhum campo para atualizar.')

export const detailedCreateWorkSchema = createWorkSchema.extend({
  creators: z.array(creatorInputSchema).optional(),
  genres: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  collectionIds: z.array(z.string().uuid()).optional(),
  source: createSourceSchema.omit({ workId: true }).optional()
})

export const detailedUpdateWorkSchema = z.object({
  work: z.union([updateWorkSchema, z.object({ id: z.string().uuid() })]),
  aliases: z.array(aliasInputSchema).optional(),
  creators: z.array(creatorInputSchema).optional(),
  genres: z.array(z.string().trim().min(1)).optional()
})

export const remoteCoverSchema = z.object({
  workId: z.string().uuid(),
  url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.')
})

export const openExternalSchema = z.object({
  url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.')
})

export const metadataSearchSchema = z.object({ provider: z.string().trim().min(1).default('anilist'), query: z.string().trim().min(3).max(120) })
export const metadataReviewSchema = z.object({ provider: z.string().trim().min(1), externalId: z.string().trim().min(1) })
export const metadataImportSchema = z.object({
  provider: z.string().trim().min(1), externalId: z.string().trim().min(1), title: z.string().trim().min(1),
  mediaType: mediaTypeSchema, userStatus: userStatusSchema, chapter: z.string().trim().min(1).nullable().optional(),
  lastReadNote: nullableText, allowProbableDuplicate: z.boolean().optional(),
  source: createSourceSchema.omit({ workId: true }).optional()
})
export const metadataRefreshSchema = workIdSchema
export const coverWorkSchema = workIdSchema
export const coverPreviewSchema = z.object({
  url: z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Protocolo não permitido.')
})
export const urlMetadataAnalyzeSchema = z.object({ url: z.string().trim().min(1).max(2048) })
export const urlMetadataDuplicateSchema = urlMetadataAnalyzeSchema.extend({
  title: z.string().trim().min(1).max(300).nullable().optional()
})

export const updateProgressSchema = z.object({
  workId: z.string().uuid(),
  chapterLabel: z.string().trim().min(1),
  sourceId: z.string().uuid().nullable().optional(),
  note: nullableText,
  occurredAt: utcTimestampSchema.optional(),
  eventType: z.enum(['progress_update', 'correction']).optional(),
  confirmSuspicious: z.boolean().optional()
})

export const numericProgressActionSchema = z.object({
  workId: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  note: nullableText,
  occurredAt: utcTimestampSchema.optional()
})

export const librarySortSchema = z.enum([
  'last_read_desc',
  'last_read_asc',
  'title_asc',
  'title_desc',
  'created_desc',
  'updated_desc',
  'chapter_desc',
  'rating_desc'
])

export const libraryQuerySchema = z.object({
  search: z.string().optional(),
  userStatuses: z.array(userStatusSchema).optional(),
  mediaTypes: z.array(mediaTypeSchema).optional(),
  publicationStatuses: z.array(publicationStatusSchema.nullable()).optional(),
  favorite: z.boolean().optional(),
  hasProgress: z.boolean().optional(),
  sort: librarySortSchema.optional()
})

export const listWorksSchema = libraryQuerySchema.optional()
export const searchLibrarySchema = libraryQuerySchema.omit({ search: true }).extend({ query: z.string() })
