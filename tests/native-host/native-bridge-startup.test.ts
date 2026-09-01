import { describe, expect, it } from 'vitest'
import { isNativeBridgeStartup, shouldRestoreWindowForSecondInstance } from '@main/app/native-bridge-startup'

describe('inicialização oculta do Desktop Bridge', () => {
  it('reconhece o argumento dedicado e não restaura a janela da instância existente', () => {
    expect(isNativeBridgeStartup(['Auri.exe', '--native-bridge-start'])).toBe(true)
    expect(shouldRestoreWindowForSecondInstance(['Auri.exe', '--native-bridge-start'])).toBe(false)
  })

  it('preserva a restauração normal para outras segundas instâncias', () => {
    expect(isNativeBridgeStartup(['Auri.exe'])).toBe(false)
    expect(shouldRestoreWindowForSecondInstance(['Auri.exe'])).toBe(true)
  })
})

