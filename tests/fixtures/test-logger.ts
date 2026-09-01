import type { LogCategory, LogContext, Logger } from '@main/logging/logger'

export class TestLogger implements Logger {
  readonly entries: Array<{
    level: string
    category: LogCategory
    message: string
    context?: LogContext
  }> = []

  debug(category: LogCategory, message: string, context?: LogContext): void {
    this.entries.push({ level: 'debug', category, message, context })
  }

  info(category: LogCategory, message: string, context?: LogContext): void {
    this.entries.push({ level: 'info', category, message, context })
  }

  warn(category: LogCategory, message: string, context?: LogContext): void {
    this.entries.push({ level: 'warn', category, message, context })
  }

  error(category: LogCategory, message: string, context?: LogContext): void {
    this.entries.push({ level: 'error', category, message, context })
  }
}

