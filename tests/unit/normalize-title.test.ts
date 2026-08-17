import { describe, expect, it } from 'vitest'
import { normalizeTitle } from '@shared/utils/normalize-title'

describe('normalizeTitle', () => {
  it('normaliza caixa, acentos, pontuação e espaços', () => {
    expect(normalizeTitle('  A Vilã… Vive!  ')).toBe('a vila vive')
  })

  it('preserva letras e números relevantes', () => {
    expect(normalizeTitle('10A — Especial 2')).toBe('10a especial 2')
  })
})

