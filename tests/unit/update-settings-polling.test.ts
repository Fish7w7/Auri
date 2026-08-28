import { describe, expect, it } from 'vitest'
import type { UpdateState } from '@shared/contracts'
import { formatUpdateCheckedAt, shouldPollUpdateState, updateStatusMessage } from '@renderer/components/settings/UpdatesSettings'

describe('polling da tela de atualizações', () => {
  it('consulta repetidamente apenas enquanto verifica ou baixa', () => {
    expect(shouldPollUpdateState('checking')).toBe(true)
    expect(shouldPollUpdateState('downloading')).toBe(true)
    for (const status of ['unavailable', 'idle', 'up_to_date', 'available', 'ready', 'error'] as const) {
      expect(shouldPollUpdateState(status)).toBe(false)
    }
  })

  it('formata a última verificação sem inventar persistência', () => {
    expect(formatUpdateCheckedAt(new Date(2026, 7, 25, 12, 18), new Date(2026, 7, 25, 16, 0))).toBe('Verificado hoje, 12:18')
  })

  it('usa uma mensagem principal clara em cada estado relevante', () => {
    const state: UpdateState = { status: 'up_to_date', currentVersion: '1.7.0', availableVersion: null, progressPercent: null, releaseNotes: null, errorMessage: null, lastCheckedAt: null, availability: 'ready' }
    expect(updateStatusMessage(state)).toBe('Você está usando a versão mais recente.')
    expect(updateStatusMessage({ ...state, status: 'available', availableVersion: '1.7.1' })).toBe('1.7.1 está disponível')
    expect(updateStatusMessage({ ...state, status: 'downloading', availableVersion: '1.7.1', progressPercent: 59 })).toBe('Baixando Auri 1.7.1')
    expect(updateStatusMessage({ ...state, status: 'ready', availableVersion: '1.7.1', progressPercent: 100 })).toBe('Auri 1.7.1 está pronta para instalar')
    expect(updateStatusMessage({ ...state, status: 'error', errorMessage: 'Não foi possível baixar a atualização.' })).toBe('Não foi possível baixar a atualização.')
  })
})
