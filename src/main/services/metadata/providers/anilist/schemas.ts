import { z } from 'zod'

const fuzzyDateSchema = z.object({ year: z.number().int().nullable(), month: z.number().int().nullable(), day: z.number().int().nullable() })
const titleSchema = z.object({ english: z.string().nullable(), romaji: z.string().nullable(), native: z.string().nullable() })
const baseMediaSchema = z.object({
  id: z.number().int().positive(), title: titleSchema, format: z.string().nullable(), status: z.string().nullable(),
  startDate: fuzzyDateSchema, countryOfOrigin: z.string().nullable(),
  coverImage: z.object({ large: z.string().nullable(), extraLarge: z.string().nullable() }).nullable(), siteUrl: z.string().nullable()
})

export const searchDataSchema = z.object({ Page: z.object({ media: z.array(baseMediaSchema) }) })
export const detailsDataSchema = z.object({ Media: baseMediaSchema.extend({
  synonyms: z.array(z.string()), description: z.string().nullable(), endDate: fuzzyDateSchema,
  genres: z.array(z.string()), staff: z.object({ edges: z.array(z.object({ role: z.string(), node: z.object({ name: z.object({ full: z.string() }) }) })) })
}).nullable() })

export type AniListMedia = z.infer<typeof baseMediaSchema>
export type AniListDetailedMedia = NonNullable<z.infer<typeof detailsDataSchema>['Media']>
