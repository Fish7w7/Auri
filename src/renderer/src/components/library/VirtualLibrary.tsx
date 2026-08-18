import { useEffect, useMemo, useRef, useState, type UIEventHandler } from 'react'
import type { CardSize, LibraryView, Work } from '@shared/contracts'
import { WorkCard } from '../work/WorkCard'
import { WorkListRow } from '../work/WorkListRow'

interface Props {
  works: Work[]
  view: LibraryView
  cardSize: CardSize
  onOpen(work: Work): void
  onFavorite(work: Work): void
  onIncrement(work: Work): void
  onTrash(work: Work): void
  selectionMode?: boolean
  selectedIds?: ReadonlySet<string>
  onSelect?(work: Work, extendRange: boolean): void
}

export const LIBRARY_CARD_LAYOUT: Record<CardSize, { targetWidth: number; gap: number; detailsHeight: number }> = {
  small: { targetWidth: 142, gap: 14, detailsHeight: 102 },
  medium: { targetWidth: 178, gap: 20, detailsHeight: 116 },
  large: { targetWidth: 216, gap: 26, detailsHeight: 126 }
}

export function getGridMetrics(containerWidth: number, cardSize: CardSize) {
  const layout = LIBRARY_CARD_LAYOUT[cardSize]
  const columns = Math.max(1, Math.floor((containerWidth + layout.gap) / (layout.targetWidth + layout.gap)))
  const width = (containerWidth - layout.gap * (columns - 1)) / columns
  const cardHeight = width / 0.7 + layout.detailsHeight
  return { columns, width, gap: layout.gap, rowHeight: cardHeight + layout.gap }
}

export function VirtualLibrary(props: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({ width: 800, height: 600, scrollTop: 0 })

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const updateSize = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      setMetrics((current) => ({ ...current, width, height }))
    }
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    updateSize()
    return () => observer.disconnect()
  }, [])

  const virtual = useMemo(() => {
    if (props.view === 'list') {
      const rowHeight = 76
      const start = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - 5)
      const end = Math.min(props.works.length, Math.ceil((metrics.scrollTop + metrics.height) / rowHeight) + 5)
      return { columns: 1, rowHeight, gap: 0, start, end, totalHeight: props.works.length * rowHeight }
    }
    const { columns, rowHeight, gap } = getGridMetrics(metrics.width, props.cardSize)
    const totalRows = Math.ceil(props.works.length / columns)
    const startRow = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - 2)
    const endRow = Math.min(totalRows, Math.ceil((metrics.scrollTop + metrics.height) / rowHeight) + 2)
    return { columns, rowHeight, gap, start: startRow * columns, end: Math.min(props.works.length, endRow * columns), totalHeight: totalRows * rowHeight }
  }, [metrics, props.cardSize, props.view, props.works.length])

  const visible = props.works.slice(virtual.start, virtual.end)
  const firstRow = Math.floor(virtual.start / virtual.columns)

  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const scrollTop = event.currentTarget.scrollTop
    setMetrics((current) => ({ ...current, scrollTop }))
  }

  return (
    <div className={`virtual-library virtual-library--${props.view}`} data-card-size={props.cardSize} data-columns={virtual.columns} ref={viewportRef} onScroll={handleScroll} tabIndex={-1}>
      {props.view === 'list' && <div className="library-list-header" aria-hidden="true"><span>Título</span><span>Progresso</span><span>Status</span><span>Última leitura</span><span /></div>}
      <div className="virtual-library__space" style={{ height: virtual.totalHeight }}>
        <div className="virtual-library__window" style={{ transform: `translateY(${firstRow * virtual.rowHeight}px)`, gap: props.view === 'grid' ? `${virtual.gap}px` : undefined, gridAutoRows: props.view === 'grid' ? `${virtual.rowHeight - virtual.gap}px` : undefined, gridTemplateColumns: props.view === 'grid' ? `repeat(${virtual.columns}, minmax(0, 1fr))` : undefined }}>
          {visible.map((work) => {
            const selection = { selectionMode: props.selectionMode, selected: props.selectedIds?.has(work.id), onSelect: props.onSelect }
            return props.view === 'grid'
              ? <WorkCard key={work.id} work={work} {...props} {...selection} />
              : <WorkListRow key={work.id} work={work} {...props} {...selection} />
          })}
        </div>
      </div>
    </div>
  )
}
