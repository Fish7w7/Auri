import { z } from 'zod'
import { librarySortSchema } from './domain'

export const appSettingsSchema = z.object({
  libraryView: z.enum(['grid', 'list']).default('grid'),
  librarySort: librarySortSchema.default('last_read_desc'),
  cardSize: z.enum(['small', 'medium', 'large']).default('medium'),
  sidebarCompact: z.boolean().default(false),
  closeToTray: z.boolean().default(false),
  coverCacheMaxMb: z.number().int().min(100).max(5000).default(500),
  backupAutomatic: z.boolean().default(true),
  backupFrequency: z.enum(['daily', 'weekly']).default('daily'),
  backupRetention: z.number().int().min(1).max(100).default(10),
  backupDirectory: z.string().trim().min(1).nullable().default(null)
})

export const updateSettingsSchema = z.object({
  libraryView: z.enum(['grid', 'list']).optional(),
  librarySort: librarySortSchema.optional(),
  cardSize: z.enum(['small', 'medium', 'large']).optional(),
  sidebarCompact: z.boolean().optional(),
  closeToTray: z.boolean().optional(),
  coverCacheMaxMb: z.number().int().min(100).max(5000).optional(),
  backupAutomatic: z.boolean().optional(),
  backupFrequency: z.enum(['daily', 'weekly']).optional(),
  backupRetention: z.number().int().min(1).max(100).optional(),
  backupDirectory: z.string().trim().min(1).nullable().optional()
})
