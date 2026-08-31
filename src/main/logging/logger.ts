import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { APP_BRAND } from '@shared/constants/app-branding'

export type LogCategory =
  | 'app'
  | 'database'
  | 'ipc'
  | 'metadata'
  | 'covers'
  | 'backup'
  | 'updater'
  | 'migration'
  | 'bridge'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  event?: string
  errorCode?: string
  [key: string]: string | number | boolean | null | undefined
}

export interface Logger {
  debug(category: LogCategory, message: string, context?: LogContext): void
  info(category: LogCategory, message: string, context?: LogContext): void
  warn(category: LogCategory, message: string, context?: LogContext): void
  error(category: LogCategory, message: string, context?: LogContext): void
}

export class JsonLogger implements Logger {
  constructor(private readonly logFile: string, private readonly isDevelopment = false) {
    mkdirSync(dirname(logFile), { recursive: true })
  }

  debug(category: LogCategory, message: string, context?: LogContext): void {
    if (this.isDevelopment) this.write('debug', category, message, context)
  }

  info(category: LogCategory, message: string, context?: LogContext): void {
    this.write('info', category, message, context)
  }

  warn(category: LogCategory, message: string, context?: LogContext): void {
    this.write('warn', category, message, context)
  }

  error(category: LogCategory, message: string, context?: LogContext): void {
    this.write('error', category, message, context)
  }

  private write(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context: LogContext = {}
  ): void {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...context
    })

    try {
      appendFileSync(this.logFile, `${entry}\n`, 'utf8')
    } catch (error) {
      console.error(`[${APP_BRAND.name}] Falha ao gravar log estruturado.`, error)
    }

    if (this.isDevelopment) {
      const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      output(entry)
    }
  }
}
