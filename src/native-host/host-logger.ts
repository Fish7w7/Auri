import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'

const MAX_LOG_BYTES = 1_048_576

export interface NativeHostLogFields {
  event: string
  method?: string
  requestId?: string
  durationMs?: number
  errorCode?: string
  mode?: 'prod' | 'dev'
  status?: string
}

export interface NativeHostLog {
  info(message: string, fields: NativeHostLogFields): void
  warn(message: string, fields: NativeHostLogFields): void
  error(message: string, fields: NativeHostLogFields): void
}

export class NativeHostLogger implements NativeHostLog {
  constructor(private readonly filePath: string, private readonly development: boolean) {
    mkdirSync(dirname(filePath), { recursive: true })
    this.rotateIfNeeded()
  }

  info(message: string, fields: NativeHostLogFields): void { this.write('info', message, fields) }
  warn(message: string, fields: NativeHostLogFields): void { this.write('warn', message, fields) }
  error(message: string, fields: NativeHostLogFields): void { this.write('error', message, fields) }

  private write(level: string, message: string, fields: NativeHostLogFields): void {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(), level, message,
      ...fields,
      ...(fields.requestId ? { requestId: fields.requestId.slice(0, 32) } : {})
    })
    try { appendFileSync(this.filePath, `${entry}\n`, 'utf8') } catch { /* logging nunca interfere no transporte */ }
    if (this.development) {
      try { process.stderr.write(`${entry}\n`) } catch { /* stderr é apenas diagnóstico */ }
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.filePath) || statSync(this.filePath).size < MAX_LOG_BYTES) return
      renameSync(this.filePath, `${this.filePath}.1`)
    } catch { /* rotação é best effort */ }
  }
}
