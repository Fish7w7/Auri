import { z } from 'zod'
import { librarySortSchema } from './domain'
import { DEFAULT_HOME_PREFERENCES, normalizeHomePreferences, normalizeRecentWorkIds } from '../home-preferences'

const homePreferencesValueSchema = z.object({
  sectionOrder: z.array(z.string()),
  enabledSections: z.object({
    continueReading: z.boolean(),
    recent: z.boolean(),
    favorites: z.boolean(),
    recentlyAdded: z.boolean()
  }),
  pinnedCollectionIds: z.array(z.string())
})

export const homePreferencesSchema = z.preprocess(normalizeHomePreferences, homePreferencesValueSchema)
export const recentWorkIdsSchema = z.preprocess(normalizeRecentWorkIds, z.array(z.string()).max(20))

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
  backupDirectory: z.string().trim().min(1).nullable().default(null),
  homePreferences: homePreferencesSchema.default(DEFAULT_HOME_PREFERENCES),
  recentWorkIds: recentWorkIdsSchema.default([])
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
  backupDirectory: z.string().trim().min(1).nullable().optional(),
  homePreferences: homePreferencesSchema.optional(),
  recentWorkIds: recentWorkIdsSchema.optional()
})
