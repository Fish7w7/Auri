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
  onSelect?(work: Work): void
}

const CARD_WIDTH: Record<CardSize, number> = { small: 142, medium: 178, large: 216 }
const GAP = 20

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
      return { columns: 1, rowHeight, start, end, totalHeight: props.works.length * rowHeight }
    }
    const columns = Math.max(1, Math.floor((metrics.width + GAP) / (CARD_WIDTH[props.cardSize] + GAP)))
    const width = (metrics.width - GAP * (columns - 1)) / columns
    const rowHeight = width * 1.42 + 112
    const totalRows = Math.ceil(props.works.length / columns)
    const startRow = Math.max(0, Math.floor(metrics.scrollTop / rowHeight) - 2)
    const endRow = Math.min(totalRows, Math.ceil((metrics.scrollTop + metrics.height) / rowHeight) + 2)
    return { columns, rowHeight, start: startRow * columns, end: Math.min(props.works.length, endRow * columns), totalHeight: totalRows * rowHeight }
  }, [metrics, props.cardSize, props.view, props.works.length])

  const visible = props.works.slice(virtual.start, virtual.end)
  const firstRow = Math.floor(virtual.start / virtual.columns)

  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const scrollTop = event.currentTarget.scrollTop
    setMetrics((current) => ({ ...current, scrollTop }))
  }

  return (
    <div className={`virtual-library virtual-library--${props.view}`} ref={viewportRef} onScroll={handleScroll} tabIndex={-1}>
      {props.view === 'list' && <div className="library-list-header" aria-hidden="true"><span>Título</span><span>Progresso</span><span>Status</span><span>Última leitura</span><span /></div>}
      <div className="virtual-library__space" style={{ height: virtual.totalHeight }}>
        <div className="virtual-library__window" style={{ transform: `translateY(${firstRow * virtual.rowHeight}px)`, gridTemplateColumns: props.view === 'grid' ? `repeat(${virtual.columns}, minmax(0, 1fr))` : undefined }}>
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
