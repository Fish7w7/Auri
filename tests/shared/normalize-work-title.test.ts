import { describe, expect, it } from 'vitest'
import { comparablePageTitles, preferredHumanPageTitle } from '@shared/utils/normalize-work-title'

describe('títulos humanos de página', () => {
  it('separa sanitização de exibição da normalização para comparação', () => {
    const input = {
      title: 'O Retorno do Cão de Caça dos Baskerville - Ler Online Grátis | MangáD...',
      siteName: 'MangáD'
    }
    expect(preferredHumanPageTitle(input)).toBe('O Retorno do Cão de Caça dos Baskerville')
    expect(comparablePageTitles(input)).toContain('o retorno do cao de caca dos baskerville')
  })

  it('não remove Online sem um padrão estrutural confiável', () => {
    expect(preferredHumanPageTitle({ title: 'Love Online', siteName: 'Reader' })).toBe('Love Online')
    expect(preferredHumanPageTitle({ title: 'Online Game', siteName: 'Reader' })).toBe('Online Game')
  })
})
