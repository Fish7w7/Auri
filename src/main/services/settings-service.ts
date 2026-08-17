import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { AppSettings, UpdateSettingsRequest } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { appSettingsSchema, updateSettingsSchema } from '@shared/schemas/settings'
import type { Logger } from '../logging/logger'
import { parseDomainInput } from './service-utils'

const DEFAULT_SETTINGS: AppSettings = appSettingsSchema.parse({})

export class SettingsService {
  constructor(
    private readonly settingsPath: string,
    private readonly logger: Logger
  ) {}

  getSettings(): AppSettings {
    if (!existsSync(this.settingsPath)) return { ...DEFAULT_SETTINGS }
    try {
      const stored: unknown = JSON.parse(readFileSync(this.settingsPath, 'utf8'))
      return appSettingsSchema.parse(stored)
    } catch (error) {
      this.logger.warn('app', 'Configurações inválidas; usando defaults.', {
        event: 'settings.invalid',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN'
      })
      return { ...DEFAULT_SETTINGS }
    }
  }

  updateSettings(input: unknown): AppSettings {
    const patch = parseDomainInput(updateSettingsSchema, input) as UpdateSettingsRequest
    const next = appSettingsSchema.parse({ ...this.getSettings(), ...patch })
    try {
      writeFileSync(this.settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      return next
    } catch (error) {
      this.logger.error('app', 'Não foi possível salvar configurações.', {
        event: 'settings.write_failed',
        errorCode: error instanceof Error ? error.name : 'UNKNOWN'
      })
      throw new DomainError('INTERNAL_ERROR', 'Não foi possível salvar suas preferências.')
    }
  }
}

