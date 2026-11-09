import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { ReadingStatistics, ReadingStatisticsRequest } from '@shared/contracts'
import { activityScale, activityTickIndexes, formatActivityInterval, formatActivityTick } from '../../lib/reading-statistics-chart'

const number = new Intl.NumberFormat('pt-BR')
const GROUP_LABELS = { day: 'Dia', week: 'Semana', month: 'Mês' }

export function ActivityChart({ timeline, groupBy }: {
  timeline: ReadingStatistics['timeline']; groupBy: ReadingStatisticsRequest['groupBy']
}) {
  const plot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState(timeline.length - 1)
  const [hovered, setHovered] = useState<number | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const last = timeline.length - 1
  const current = Math.min(selected, last)
  const active = Math.min(hovered ?? current, last)
  const point = timeline[active]
  const interval = formatActivityInterval(point.start, groupBy)
  const adjustments = point.records - point.updates
  const center = (index: number) => `${(index + 0.5) / timeline.length * 100}%`
  const scale = activityScale(Math.max(...timeline.map(({ records }) => records)))

  useLayoutEffect(() => {
    const element = plot.current
    if (!element) return
    setWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function intervalAt(clientX: number, bounds: DOMRect) {
    return Math.min(last, Math.max(0, Math.floor((clientX - bounds.left) / bounds.width * timeline.length)))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowLeft: active - 1, ArrowDown: active - 1, ArrowRight: active + 1, ArrowUp: active + 1, Home: 0, End: last
    }
    if (event.key === 'Escape') {
      setHovered(null)
      setShowDetails(false)
    } else if (Object.hasOwn(steps, event.key)) {
      event.preventDefault()
      setSelected(Math.max(0, Math.min(last, steps[event.key])))
      setHovered(null)
      setShowDetails(true)
    }
  }

  return <figure className="statistics-chart">
    <div className="statistics-chart__header">
      <span className="statistics-chart__unit">Registros por intervalo</span>
      <div className="statistics-chart__legend">
        <span><i className="statistics-chart__updates" />Atualizações</span>
        <span><i className="statistics-chart__adjustments" />Iniciais e correções</span>
      </div>
    </div>
    <div className="statistics-chart__body">
      <div className="statistics-chart__scale" aria-hidden="true">
        {scale.ticks.map((tick) => <span key={tick} style={{ bottom: `${tick / scale.maximum * 100}%` }}>{number.format(tick)}</span>)}
      </div>
      <div ref={plot} className="statistics-chart__plot" tabIndex={0} role="slider"
        aria-label={`Registros por intervalo. Agrupamento por ${GROUP_LABELS[groupBy].toLocaleLowerCase('pt-BR')}. Use as setas para consultar.`}
        aria-valuemin={1} aria-valuemax={timeline.length} aria-valuenow={active + 1}
        aria-valuetext={`${interval}. ${number.format(point.records)} registros, ${number.format(point.updates)} atualizações, ${number.format(adjustments)} iniciais ou correções e ${number.format(point.advances)} avanços numéricos.`}
        onFocus={() => setShowDetails(true)} onBlur={() => setShowDetails(false)} onKeyDown={onKeyDown}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') setHovered(intervalAt(event.clientX, event.currentTarget.getBoundingClientRect()))
        }}
        onPointerLeave={() => setHovered(null)}
        onClick={(event) => {
          setSelected(intervalAt(event.clientX, event.currentTarget.getBoundingClientRect()))
          setShowDetails(true)
        }}>
        {scale.ticks.map((tick) => <i className="statistics-chart__gridline" key={tick} aria-hidden="true" style={{ bottom: `${tick / scale.maximum * 100}%` }} />)}
        <div className="statistics-chart__bars" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}>
          {timeline.map((entry, index) => <div key={entry.start} className={index === active && (hovered !== null || showDetails) ? 'is-active' : undefined}>
            {entry.records > 0 && <div className="statistics-chart__bar" style={{ height: `${entry.records / scale.maximum * 100}%` }}>
              <span className="statistics-chart__updates" style={{ flex: entry.updates }} />
              <span className="statistics-chart__adjustments" style={{ flex: entry.records - entry.updates }} />
            </div>}
          </div>)}
        </div>
        {(hovered !== null || showDetails) && <div className="statistics-chart__tooltip" aria-hidden="true" style={{ '--tooltip-anchor': center(active) } as CSSProperties}>
          <strong>{interval}</strong>
          {point.records === 0 ? <p>Sem registros neste intervalo</p> : <dl>
            <div><dt>Registros</dt><dd>{number.format(point.records)}</dd></div>
            <div><dt>Atualizações</dt><dd>{number.format(point.updates)}</dd></div>
            <div><dt>Iniciais e correções</dt><dd>{number.format(adjustments)}</dd></div>
            <div><dt>Avanços numéricos</dt><dd>{number.format(point.advances)}</dd></div>
          </dl>}
        </div>}
      </div>
      <div className="statistics-chart__dates" aria-hidden="true">
        {activityTickIndexes(timeline.length, width).map((index) =>
          <span key={timeline[index].start} style={{ '--tick-anchor': center(index) } as CSSProperties}>
            {formatActivityTick(timeline[index].start, groupBy)}
          </span>)}
      </div>
      <span className="statistics-chart__group">{GROUP_LABELS[groupBy]}</span>
    </div>
  </figure>
}
