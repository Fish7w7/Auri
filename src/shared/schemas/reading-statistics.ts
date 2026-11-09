import { z } from 'zod'
import { mediaTypeSchema, userStatusSchema } from './domain'

export const readingStatisticsSchema = z.object({
  period: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal('all')]),
  groupBy: z.enum(['day', 'week', 'month']),
  mediaType: mediaTypeSchema.optional(),
  status: userStatusSchema.optional()
})
