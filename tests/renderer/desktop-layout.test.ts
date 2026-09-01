import { describe, expect, it } from 'vitest'
import { getGridMetrics, LIBRARY_CARD_LAYOUT } from '@renderer/components/library/VirtualLibrary'

describe('densidade da grade da Biblioteca', () => {
  it('mantém tamanhos e espaçamentos distintos sem exceder a largura disponível', () => {
    const width = 808
    const small = getGridMetrics(width, 'small')
    const medium = getGridMetrics(width, 'medium')
    const large = getGridMetrics(width, 'large')

    expect(small.columns).toBeGreaterThan(medium.columns)
    expect(medium.columns).toBeGreaterThan(large.columns)
    expect(LIBRARY_CARD_LAYOUT.small.gap).toBeLessThan(LIBRARY_CARD_LAYOUT.medium.gap)
    expect(LIBRARY_CARD_LAYOUT.medium.gap).toBeLessThan(LIBRARY_CARD_LAYOUT.large.gap)
    for (const metrics of [small, medium, large]) {
      expect(metrics.width * metrics.columns + metrics.gap * (metrics.columns - 1)).toBeCloseTo(width)
      expect(metrics.rowHeight).toBeGreaterThan(metrics.width / 0.7)
    }
  })
})
