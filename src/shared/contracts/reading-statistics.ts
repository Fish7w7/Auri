import type { z } from 'zod'
import type { readingStatisticsSchema } from '../schemas/reading-statistics'
import type { MediaType, UserStatus } from '../types/domain'

export type ReadingStatisticsRequest = z.infer<typeof readingStatisticsSchema>

export interface ReadingActivity {
  records: number
  updates: number
  advances: number
}

export interface ReadingStatistics {
  library: {
    total: number
    completed: number
    inProgress: number
    notStarted: number
    byStatus: Partial<Record<UserStatus, number>>
    byMediaType: Partial<Record<MediaType, number>>
  }
  activity: ReadingActivity
  timeline: Array<ReadingActivity & { start: string }>
  timelineTruncated: boolean
  ranking: Array<ReadingActivity & { workId: string; title: string }>
}
