import { describe, expect, it } from 'vitest'
import { formatUpdateCheckedAt, shouldPollUpdateState } from '@renderer/components/settings/UpdatesSettings'

describe('polling da tela de atualizações', () => {
  it('consulta repetidamente apenas enquanto verifica ou baixa', () => {
    expect(shouldPollUpdateState('checking')).toBe(true)
    expect(shouldPollUpdateState('downloading')).toBe(true)
    for (const status of ['unavailable', 'idle', 'up_to_date', 'available', 'ready', 'error'] as const) {
      expect(shouldPollUpdateState(status)).toBe(false)
    }
  })

  it('formata a última verificação sem inventar persistência', () => {
    expect(formatUpdateCheckedAt(new Date('2026-08-25T12:18:00-03:00'), new Date('2026-08-25T16:00:00-03:00'))).toContain('hoje')
  })
})