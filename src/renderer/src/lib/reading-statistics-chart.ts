import type { ReadingStatisticsRequest } from '@shared/contracts'

type GroupBy = ReadingStatisticsRequest['groupBy']

const dayTick = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const monthTick = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const dayLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' })
const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function activityScale(peak: number) {
  const idealStep = Math.max(1, peak / 4)
  const magnitude = 10 ** Math.floor(Math.log10(idealStep))
  const step = magnitude * ([1, 2, 2.5, 5, 10].find((multiple) => Number.isInteger(magnitude * multiple) && magnitude * multiple >= idealStep) ?? 10)
  const intervals = Math.max(1, Math.ceil(peak / step))
  return { maximum: step * intervals, ticks: Array.from({ length: intervals + 1 }, (_, index) => index * step) }
}

export function activityTickIndexes(length: number, width: number) {
  if (length < 2) return length === 1 ? [0] : []
  const count = Math.min(length, Math.max(2, Math.floor(width / 86)))
  return Array.from({ length: count }, (_, index) => Math.round(index * (length - 1) / (count - 1)))
}

export function formatActivityTick(start: string, groupBy: GroupBy) {
  const date = new Date(`${start}T00:00:00Z`)
  return (groupBy === 'month' ? monthTick : dayTick).format(date)
}

export function formatActivityInterval(start: string, groupBy: GroupBy) {
  const date = new Date(`${start}T00:00:00Z`)
  if (groupBy === 'month') return monthLabel.format(date)
  if (groupBy === 'day') return dayLabel.format(date)
  const end = new Date(date)
  end.setUTCDate(end.getUTCDate() + 6)
  return dayLabel.formatRange(date, end)
}
