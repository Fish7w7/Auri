import { describe, expect, it } from 'vitest'
import { activityScale, activityTickIndexes, formatActivityInterval, formatActivityTick } from '../../src/renderer/src/lib/reading-statistics-chart'

describe('escala do gráfico de leitura', () => {
  it('parte de zero e usa marcas inteiras até cobrir o maior valor', () => {
    expect(activityScale(0)).toEqual({ maximum: 1, ticks: [0, 1] })
    expect(activityScale(3)).toEqual({ maximum: 3, ticks: [0, 1, 2, 3] })
    expect(activityScale(187)).toEqual({ maximum: 200, ticks: [0, 50, 100, 150, 200] })
  })

  it('distribui rótulos sem repetir intervalos e inclui os extremos ao redimensionar', () => {
    expect(activityTickIndexes(1, 350)).toEqual([0])
    expect(activityTickIndexes(3, 900)).toEqual([0, 1, 2])
    expect(activityTickIndexes(180, 350)).toEqual([0, 60, 119, 179])
    expect(activityTickIndexes(180, 900)).toHaveLength(10)
  })

  it('apresenta datas de calendário, incluindo semanas que cruzam o ano', () => {
    expect(formatActivityTick('2026-01-01', 'day')).toBe('01/01')
    expect(formatActivityInterval('2026-01-01', 'month')).toBe('janeiro de 2026')
    const week = formatActivityInterval('2025-12-29', 'week')
    expect(week).toContain('29 de dezembro de 2025')
    expect(week).toContain('4 de janeiro de 2026')
  })
})
