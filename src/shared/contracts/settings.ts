import type { z } from 'zod'
import type { appSettingsSchema, updateSettingsSchema } from '@shared/schemas/settings'

export type AppSettings = z.infer<typeof appSettingsSchema>
export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>

export interface SettingsApi {
  settings: {
    get(): Promise<AppSettings>
    update(request: UpdateSettingsRequest): Promise<AppSettings>
  }
}

import type { BackupApi } from './backup'
import type { TransferApi } from './transfer'

export interface DataManagementApi extends BackupApi, TransferApi {}
