import { describe, expect, it } from 'vitest'
import { shouldPollUpdateState } from '@renderer/components/settings/UpdatesSettings'

describe('polling da tela de atualizações', () => {
  it('consulta repetidamente apenas enquanto verifica ou baixa', () => {
    expect(shouldPollUpdateState('checking')).toBe(true)
    expect(shouldPollUpdateState('downloading')).toBe(true)
    for (const status of ['unavailable', 'idle', 'up_to_date', 'available', 'ready', 'error'] as const) {
      expect(shouldPollUpdateState(status)).toBe(false)
    }
  })
})
