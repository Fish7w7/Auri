import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Collection, Work } from '@shared/contracts'
import { DEFAULT_HOME_PREFERENCES, HOME_BUILT_IN_SECTIONS, moveHomeSection, moveHomeSectionToIndex, normalizeHomePreferences, pinHomeCollection, unpinHomeCollection, type HomeBuiltInSection, type HomePreferences } from '@shared/home-preferences'
import { subscribeToDataChanges } from '../../app/data-changes'
import { useAppContext } from '../../app/app-context'
import { useToast } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'

const LABELS: Record<HomeBuiltInSection, string> = {
  continueReading: 'Continuar lendo',
  recent: 'Recentes',
  favorites: 'Favoritos',
  recentlyAdded: 'Adicionados recentemente'
}

const SORT_ANIMATION_MS = 150

type PointerDrag = {
  id: string
  pointerId: number
  offsetY: number
  top: number
  height: number
  initialOrder: string[]
}

export function HomeCustomizationDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { settings, updateSettings, refreshData } = useAppContext()
  const { showToast } = useToast()
  const [collections, setCollections] = useState<Collection[]>([])
  const [hiddenWorks, setHiddenWorks] = useState<Work[]>([])
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [hiddenSearch, setHiddenSearch] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('')
  const [busy, setBusy] = useState(false)
  const [pointerDrag, setPointerDrag] = useState<PointerDrag | null>(null)
  const [keyboardId, setKeyboardId] = useState<string | null>(null)
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)
  const [reorderAnnouncement, setReorderAnnouncement] = useState('')
  const sectionsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<PointerDrag | null>(null)
  const dragHandleRef = useRef<HTMLButtonElement | null>(null)
  const orderRef = useRef<string[]>([])
  const rowElements = useRef(new Map<string, HTMLDivElement>())
  const previousRowTops = useRef(new Map<string, number>())
  const rowAnimations = useRef(new Map<string, Animation>())
  const reorderInstructionsId = useId()
  const preferences = settings.homePreferences

  const load = useCallback(async () => {
    const [nextCollections, nextHidden] = await Promise.all([
      window.auri.collections.list(),
      window.auri.library.query({ hiddenFromHome: true, sort: 'title_asc' })
    ])
    setCollections(nextCollections)
    setHiddenWorks(nextHidden)
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    return subscribeToDataChanges(() => void load())
  }, [load, open])

  const availableCollections = useMemo(() => collections.filter((item) => !preferences.pinnedCollectionIds.includes(item.id)), [collections, preferences.pinnedCollectionIds])
  useEffect(() => {
    if (!availableCollections.some((item) => item.id === selectedCollection)) setSelectedCollection(availableCollections[0]?.id ?? '')
  }, [availableCollections, selectedCollection])

  const persist = async (next: HomePreferences) => {
    setBusy(true)
    try { await updateSettings({ homePreferences: normalizeHomePreferences(next) }) }
    catch { showToast({ kind: 'error', message: 'Não foi possível salvar as preferências da Home.' }) }
    finally { setBusy(false) }
  }

  const persistOrder = async (sectionOrder: string[]) => {
    setOrderOverride(sectionOrder)
    await persist({ ...preferences, sectionOrder })
    setOrderOverride(null)
  }

  const pin = async () => {
    if (!selectedCollection) return
    const next = pinHomeCollection(preferences, selectedCollection)
    if (!next) {
      showToast({ kind: 'warning', message: 'Você pode fixar até 3 coleções na Home.' })
      return
    }
    await persist(next)
    showToast({ kind: 'success', message: 'Coleção fixada na Home.' })
  }

  const unpin = async (collectionId: string) => {
    await persist(unpinHomeCollection(preferences, collectionId))
    showToast({ kind: 'info', message: 'Coleção removida da Home.' })
  }

  const showOnHome = async (work: Work) => {
    setBusy(true)
    try {
      await window.auri.works.update({ id: work.id, hiddenFromHome: false })
      setHiddenWorks((current) => current.filter((item) => item.id !== work.id))
      refreshData()
      showToast({ kind: 'success', message: 'Obra restaurada na Home.' })
    } finally { setBusy(false) }
  }

  const visibleHidden = hiddenWorks.filter((work) => work.normalizedTitle.includes(normalizeSearchText(hiddenSearch)))
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]))
  const displayedOrder = orderOverride ?? preferences.sectionOrder
  const rows = displayedOrder.flatMap((id) => {
    if ((HOME_BUILT_IN_SECTIONS as readonly string[]).includes(id)) return [{ id, label: LABELS[id as HomeBuiltInSection], builtIn: true }]
    const collection = collectionById.get(id)
    return collection ? [{ id, label: collection.name, builtIn: false }] : []
  })

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, element] of rowElements.current) {
      if (id === pointerDrag?.id) continue
      const top = element.getBoundingClientRect().top
      const previousTop = previousRowTops.current.get(id)
      nextTops.set(id, top)
      if (reduceMotion || previousTop === undefined || Math.abs(previousTop - top) < 1) continue
      rowAnimations.current.get(id)?.cancel()
      const animation = element.animate(
        [{ transform: `translateY(${previousTop - top}px)` }, { transform: 'translateY(0)' }],
        { duration: SORT_ANIMATION_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' }
      )
      rowAnimations.current.set(id, animation)
    }
    previousRowTops.current = nextTops
  }, [displayedOrder, pointerDrag?.id])

  const announcePosition = (id: string, order: readonly string[], prefix = 'Movida') => {
    const row = rows.find((item) => item.id === id)
    const position = order.indexOf(id) + 1
    if (row && position > 0) setReorderAnnouncement(`${row.label}. ${prefix} para a posição ${position} de ${order.length}.`)
  }

  const startPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (busy || event.button !== 0) return
    const row = event.currentTarget.closest<HTMLElement>('.home-customization__row')
    const sections = sectionsRef.current
    if (!row || !sections) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rowBounds = row.getBoundingClientRect()
    const sectionsBounds = sections.getBoundingClientRect()
    const initialOrder = [...preferences.sectionOrder]
    const drag = {
      id,
      pointerId: event.pointerId,
      offsetY: event.clientY - rowBounds.top,
      top: rowBounds.top - sectionsBounds.top,
      height: rowBounds.height,
      initialOrder
    }
    previousRowTops.current = new Map([...rowElements.current].map(([rowId, element]) => [rowId, element.getBoundingClientRect().top]))
    dragRef.current = drag
    dragHandleRef.current = event.currentTarget
    orderRef.current = initialOrder
    setKeyboardId(null)
    setOrderOverride(initialOrder)
    setPointerDrag(drag)
    setReorderAnnouncement(`Movendo ${rows.find((item) => item.id === id)?.label ?? 'seção'}.`)
  }

  useEffect(() => {
    if (!pointerDrag) return
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    const stopPointerDrag = (commit: boolean) => {
      const drag = dragRef.current
      if (!drag) return
      const order = orderRef.current
      const changed = order.some((id, index) => id !== drag.initialOrder[index])
      if (dragHandleRef.current?.hasPointerCapture(drag.pointerId)) dragHandleRef.current.releasePointerCapture(drag.pointerId)
      dragRef.current = null
      dragHandleRef.current = null
      setPointerDrag(null)
      if (commit && changed) {
        announcePosition(drag.id, order)
        void persistOrder(order)
      } else {
        setOrderOverride(null)
        setReorderAnnouncement(`${rows.find((item) => item.id === drag.id)?.label ?? 'Seção'}. ${commit ? 'Posição mantida.' : 'Reordenação cancelada.'}`)
      }
    }

    const movePointerDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      const sections = sectionsRef.current
      if (!drag || !sections || event.pointerId !== drag.pointerId) return
      event.preventDefault()
      const sectionsBounds = sections.getBoundingClientRect()
      const maxTop = Math.max(0, sections.clientHeight - drag.height)
      const top = Math.max(0, Math.min(maxTop, event.clientY - sectionsBounds.top - drag.offsetY))
      const targetIndex = Math.max(0, Math.min(orderRef.current.length - 1, Math.round(top / drag.height)))
      const current = { ...preferences, sectionOrder: orderRef.current }
      const next = moveHomeSectionToIndex(current, drag.id, targetIndex)
      if (next !== current) {
        orderRef.current = next.sectionOrder
        setOrderOverride(next.sectionOrder)
      }
      dragRef.current = { ...drag, top }
      setPointerDrag(dragRef.current)
    }

    const finishPointerDrag = (event: PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) stopPointerDrag(true)
    }
    const cancelPointerDrag = (event: PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) stopPointerDrag(false)
    }
    const cancelWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      stopPointerDrag(false)
    }

    window.addEventListener('pointermove', movePointerDrag, { passive: false })
    window.addEventListener('pointerup', finishPointerDrag)
    window.addEventListener('pointercancel', cancelPointerDrag)
    window.addEventListener('keydown', cancelWithEscape, true)
    return () => {
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', movePointerDrag)
      window.removeEventListener('pointerup', finishPointerDrag)
      window.removeEventListener('pointercancel', cancelPointerDrag)
      window.removeEventListener('keydown', cancelWithEscape, true)
    }
  }, [pointerDrag?.pointerId])

  const handleReorderKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (busy) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (keyboardId === id && orderOverride) {
        const order = orderOverride
        setKeyboardId(null)
        setReorderAnnouncement(`${rows.find((item) => item.id === id)?.label ?? 'Seção'}. Nova posição confirmada.`)
        void persistOrder(order)
      } else {
        setKeyboardId(id)
        setOrderOverride([...preferences.sectionOrder])
        announcePosition(id, preferences.sectionOrder, 'Pronta para mover; posição atual')
      }
      return
    }
    if (keyboardId !== id) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setKeyboardId(null)
      setOrderOverride(null)
      setReorderAnnouncement(`${rows.find((item) => item.id === id)?.label ?? 'Seção'}. Reordenação cancelada.`)
      return
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const current = { ...preferences, sectionOrder: orderOverride ?? preferences.sectionOrder }
    const next = moveHomeSection(current, id, event.key === 'ArrowUp' ? -1 : 1)
    setOrderOverride(next.sectionOrder)
    announcePosition(id, next.sectionOrder)
  }

  return <>
    <Dialog open={open} title="Personalizar Home" description="Escolha o que aparece e em qual ordem." size="large" busy={busy} onClose={onClose} footer={<><Button disabled={busy} onClick={async () => { await persist(DEFAULT_HOME_PREFERENCES); showToast({ kind: 'info', message: 'Home restaurada para o padrão.' }) }}>Restaurar padrão</Button><Button variant="primary" disabled={busy} onClick={onClose}>Concluir</Button></>}>
      <div className="home-customization">
        <div ref={sectionsRef} className={`home-customization__sections${pointerDrag ? ' is-dragging' : ''}`} aria-label="Ordem das seções da Home">
          <span id={reorderInstructionsId} className="sr-only">Pressione Enter ou Espaço para reordenar, use as setas para mover, Enter ou Espaço para confirmar e Escape para cancelar.</span>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{reorderAnnouncement}</span>
          {rows.map((row) => <Fragment key={row.id}>
            {pointerDrag?.id === row.id && <div key="placeholder" className="home-customization__placeholder" style={{ height: pointerDrag.height }} aria-hidden="true" />}
            <div
            key="row"
            ref={(element) => { if (element) rowElements.current.set(row.id, element); else rowElements.current.delete(row.id) }}
            data-reorder-id={row.id}
            className={`home-customization__row${pointerDrag?.id === row.id ? ' is-dragging' : ''}${keyboardId === row.id ? ' is-keyboard-reordering' : ''}`}
            style={pointerDrag?.id === row.id ? { top: pointerDrag.top, height: pointerDrag.height } : undefined}
          >
            <button
              type="button"
              className="home-customization__handle"
              disabled={busy}
              aria-label={`Reordenar ${row.label}`}
              aria-describedby={reorderInstructionsId}
              aria-pressed={keyboardId === row.id}
              title={`Reordenar ${row.label}`}
              onPointerDown={(event) => startPointerDrag(event, row.id)}
              onKeyDown={(event) => handleReorderKey(event, row.id)}
            ><span aria-hidden="true">⋮⋮</span></button>
            <strong>{row.label}</strong>
            {row.builtIn
              ? <Switch checked={preferences.enabledSections[row.id as HomeBuiltInSection]} label={`Mostrar ${row.label} na Home`} disabled={busy} onCheckedChange={(checked) => void persist({ ...preferences, enabledSections: { ...preferences.enabledSections, [row.id]: checked } })} />
              : <Button variant="ghost" disabled={busy} onClick={() => void unpin(row.id)}>Remover</Button>}
          </div></Fragment>)}
        </div>

        <section className="home-customization__group">
          <div><h3>Coleções na Home</h3><span>Máximo de 3 coleções.</span></div>
          <div className="home-customization__pin">
            <Select label="Coleção para fixar" value={selectedCollection} disabled={!availableCollections.length || busy} onChange={setSelectedCollection} options={availableCollections.length ? availableCollections.map((item) => ({ value: item.id, label: item.name })) : [{ value: '', label: 'Nenhuma coleção disponível' }]} />
            <Button icon="plus" disabled={!selectedCollection || busy} onClick={() => void pin()}>Fixar coleção</Button>
          </div>
        </section>

        <section className="home-customization__group home-customization__hidden">
          <div><h3>Obras ocultas da Home</h3><span>{hiddenWorks.length} {hiddenWorks.length === 1 ? 'obra oculta' : 'obras ocultas'}</span></div>
          <Button onClick={() => setHiddenOpen(true)}>Gerenciar</Button>
        </section>
      </div>
    </Dialog>
    <Dialog open={hiddenOpen} title="Obras ocultas da Home" description="Escolha quais obras devem voltar a aparecer nas seções da Home." onClose={() => setHiddenOpen(false)} footer={<Button onClick={() => setHiddenOpen(false)}>Voltar</Button>}>
      <div className="hidden-home-manager">
        <label className="field"><span>Pesquisar obras ocultas</span><input autoFocus value={hiddenSearch} onChange={(event) => setHiddenSearch(event.target.value)} placeholder="Pesquisar por título…" /></label>
        <div className="hidden-home-list">{visibleHidden.length === 0 && <p className="muted-copy">Nenhuma obra oculta encontrada.</p>}{visibleHidden.map((work) => <article key={work.id}><div><strong>{work.title}</strong><span>{work.userStatus.replaceAll('_', ' ')}</span></div><Button disabled={busy} onClick={() => void showOnHome(work)}>Mostrar na Home</Button></article>)}</div>
      </div>
    </Dialog>
  </>
}
