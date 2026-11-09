import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Work } from '@shared/contracts'
import { navigate } from '../../app/navigation'
import { useAppContext } from '../../app/app-context'
import { formatChapter, STATUS_LABELS } from '../../lib/format'
import { dispatchQuickSearchAction, getQuickSearchActions, type QuickSearchAction, type WorkCommand } from '../../lib/quick-search'
import { getQuickSearchScroll } from '../../lib/quick-search-scroll'
import { runLatestLibraryRequest } from '../../lib/latest-library-request'
import { useReadingResume } from '../../hooks/use-reading-resume'
import { useToast } from '../ui/Toast'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { WorkCover } from '../work/WorkCover'

export type QuickSearchPhase = 'idle' | 'loading' | 'empty' | 'results' | 'error'
export function getQuickSearchPhase(query: string, loading: boolean, resultCount: number, failed: boolean): QuickSearchPhase {
  if (failed) return 'error'
  if (loading) return 'loading'
  if (!query.trim()) return 'idle'
  return resultCount > 0 ? 'results' : 'empty'
}

type QuickItem = { id: string; type: 'work'; work: Work } | { id: string; type: 'action'; action: QuickSearchAction }

export interface QuickSearchResultsState<T> {
  results: T[]
  settledQuery: string
  loading: boolean
  failed: boolean
}

export function beginQuickSearch<T>(state: QuickSearchResultsState<T>): QuickSearchResultsState<T> {
  return { ...state, loading: true, failed: false }
}

export function completeQuickSearch<T>(query: string, results: T[]): QuickSearchResultsState<T> {
  return { results, settledQuery: query, loading: false, failed: false }
}

export function failQuickSearch<T>(query: string): QuickSearchResultsState<T> {
  return { results: [], settledQuery: query, loading: false, failed: true }
}

export function normalizeQuickSearchSelection(items: readonly { id: string }[], selectedId: string | null): string | null {
  return selectedId && items.some((item) => item.id === selectedId) ? selectedId : items[0]?.id ?? null
}

const EMPTY_RESULTS: QuickSearchResultsState<Work> = { results: [], settledQuery: '', loading: false, failed: false }
const RECENT_ACTIONS_KEY = 'auri:recent-quick-actions'

function readRecentActions(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_ACTIONS_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, 4) : []
  } catch { return [] }
}

export function QuickSearchDialog({ open, onClose, currentWorkId, onWorkCommand }: {
  open: boolean
  onClose(): void
  currentWorkId?: string
  onWorkCommand(id: string, command: WorkCommand): void
}) {
  const { settings, openAddWork, openWorkFromQuickSearch, refreshData } = useAppContext()
  const { showToast } = useToast()
  const resume = useReadingResume(refreshData)
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const entries = useRef<HTMLDivElement>(null)
  const followSelection = useRef(true)
  const resetScroll = useRef(true)
  const [query, setQuery] = useState('')
  const [workCommand, setWorkCommand] = useState<Extract<QuickSearchAction, { kind: 'work' }> | null>(null)
  const [recentActions, setRecentActions] = useState(readRecentActions)
  const [searchState, setSearchState] = useState<QuickSearchResultsState<Work>>(EMPTY_RESULTS)
  const [recent, setRecent] = useState<Work[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const hasAcceptedResult = useRef(false)
  const trimmedQuery = query.trim()

  useEffect(() => {
    if (!open) return
    generation.current += 1
    hasAcceptedResult.current = false
    setQuery(''); setWorkCommand(null); setSearchState(EMPTY_RESULTS); setSelectedId(null); setRetry(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    let active = true
    const recentIds = settings.recentWorkIds.slice(0, 8)
    void Promise.allSettled(recentIds.map((workId) => window.auri.works.get({ workId }))).then((results) => {
      if (active) setRecent(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []).slice(0, 5))
    })
    return () => { active = false }
  }, [open, settings.recentWorkIds])
  useEffect(() => {
    if (!open) return
    generation.current += 1
    if (!trimmedQuery) { setSearchState(EMPTY_RESULTS); return }
    const timer = window.setTimeout(() => {
      void runLatestLibraryRequest({
        generation,
        hasAcceptedResult,
        request: () => window.auri.library.search({ query: trimmedQuery, limit: 8, recentWorkIds: settings.recentWorkIds }),
        onStart: () => setSearchState(beginQuickSearch),
        onSuccess: (items) => setSearchState(completeQuickSearch(trimmedQuery, items)),
        onError: () => setSearchState(failQuickSearch(trimmedQuery)),
        onSettled: () => setSearchState((current) => current.loading ? { ...current, loading: false } : current)
      })
    }, 120)
    return () => { window.clearTimeout(timer); generation.current += 1 }
  }, [open, retry, settings.recentWorkIds, trimmedQuery])
  useEffect(() => () => { generation.current += 1 }, [])

  const actions = useMemo(() => {
    if (workCommand) return []
    const available = getQuickSearchActions(trimmedQuery, recentActions)
    return trimmedQuery ? available : available.slice(0, 6 + recentActions.length)
  }, [trimmedQuery, recentActions, workCommand])
  const currentQuerySettled = !trimmedQuery || searchState.settledQuery === trimmedQuery
  const visibleWorks = !trimmedQuery ? recent : currentQuerySettled ? searchState.results : EMPTY_RESULTS.results
  const actionItems = actions.map((action) => ({ id: `action:${action.id}`, type: 'action' as const, action }))
  const workItems = visibleWorks.map((work): QuickItem => ({ id: `work:${work.id}`, type: 'work', work }))
  const recentItemCount = trimmedQuery ? 0 : actions.filter((action) => recentActions.includes(action.id)).length
  const items = trimmedQuery ? [...actionItems, ...workItems]
    : [...actionItems.slice(0, recentItemCount), ...workItems, ...actionItems.slice(recentItemCount)]
  const searching = !!trimmedQuery && (!currentQuerySettled || searchState.loading)
  const phase = getQuickSearchPhase(query, searching, items.length, searchState.failed && currentQuerySettled)
  const normalizedSelectedId = normalizeQuickSearchSelection(items, selectedId)
  const active = Math.max(0, items.findIndex((item) => item.id === normalizedSelectedId))

  const syncResultsScroll = useCallback(() => {
    const list = results.current
    const content = entries.current
    if (!list?.clientHeight || !content) return
    if (resetScroll.current) {
      list.scrollTop = 0
      resetScroll.current = false
    }

    const nodes = Array.from(content.querySelectorAll('[role="option"]'))
    const origin = list.getBoundingClientRect().top + list.clientTop - list.scrollTop
    const options = nodes.map((node) => {
      const { top, bottom } = node.getBoundingClientRect()
      return { top: top - origin, bottom: bottom - origin }
    })
    const { endSpace, top } = getQuickSearchScroll({
      scrollTop: list.scrollTop,
      height: list.clientHeight,
      contentHeight: content.getBoundingClientRect().height,
      options,
      selectedIndex: followSelection.current ? nodes.findIndex((node) => node.getAttribute('aria-selected') === 'true') : -1
    })
    const space = `${endSpace}px`
    if (list.style.getPropertyValue('--quick-search-end-space') !== space) {
      list.style.setProperty('--quick-search-end-space', space)
    }
    if (top !== null && list.scrollTop !== top) list.scrollTop = top
  }, [])

  useLayoutEffect(() => {
    if (!open || !results.current || !entries.current) return
    resetResultsPosition()
    let frame = 0
    const observer = new ResizeObserver(() => {
      syncResultsScroll()
      // Chromium can still clamp to the previous scroll limit while handling a resize.
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(syncResultsScroll)
    })
    observer.observe(results.current)
    observer.observe(entries.current)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [open, syncResultsScroll])

  useLayoutEffect(() => {
    if (open) syncResultsScroll()
  }, [actions, normalizedSelectedId, open, phase, syncResultsScroll, trimmedQuery, visibleWorks, workCommand])

  function resetResultsPosition() {
    resetScroll.current = true
    followSelection.current = true
  }

  function selectWithPointer(id: string) {
    followSelection.current = false
    setSelectedId(id)
  }

  function selectWithKeyboard(id: string) {
    followSelection.current = true
    setSelectedId(id)
    if (id === normalizedSelectedId) syncResultsScroll()
  }

  function changeQuery(value: string) {
    if (value.trim() !== trimmedQuery) {
      resetResultsPosition()
      setSelectedId(null)
    }
    setQuery(value)
  }

  function remember(action: QuickSearchAction) {
    const next = [action.id, ...recentActions.filter((id) => id !== action.id)].slice(0, 4)
    setRecentActions(next)
    try { localStorage.setItem(RECENT_ACTIONS_KEY, JSON.stringify(next)) } catch { /* keep the session list */ }
  }

  async function resumeLatest() {
    try {
      const home = await window.auri.library.home()
      const latest = home.continueReading[0]
      if (latest) await resume.open(latest.id, () => openWorkFromQuickSearch(latest.id))
      else {
        navigate('/')
        showToast({ kind: 'info', message: 'Ainda não há leituras em andamento.' })
      }
    } catch { showToast({ kind: 'error', message: 'Não foi possível consultar a última leitura.' }) }
  }

  function closeAndRun(action: () => void) {
    onClose()
    window.requestAnimationFrame(action)
  }

  const run = (item: QuickItem | undefined) => {
    if (!item) return
    if (item.type === 'work') {
      closeAndRun(() => {
        if (workCommand) {
          remember(workCommand)
          onWorkCommand(item.work.id, workCommand.command)
        } else openWorkFromQuickSearch(item.work.id)
      })
      return
    }
    const action = item.action
    if (action.kind !== 'work' || currentWorkId) remember(action)
    dispatchQuickSearchAction(action, {
      navigate: (path) => closeAndRun(() => navigate(path)),
      add: () => closeAndRun(openAddWork),
      resume: () => closeAndRun(() => void resumeLatest()),
      work: (command) => {
        if (currentWorkId) closeAndRun(() => onWorkCommand(currentWorkId, command))
        else if (action.kind === 'work') {
          resetResultsPosition()
          setWorkCommand(action)
          setQuery('')
          setSelectedId(null)
          input.current?.focus()
        }
      }
    })
  }

  const workGroup = visibleWorks.length > 0 && <section className="quick-search__group" role="group" aria-labelledby="quick-search-works"><h3 id="quick-search-works">{trimmedQuery ? 'Obras' : 'Obras recentes'}</h3>{visibleWorks.map((work, index) => {
    const item = workItems[index]
    const selected = item.id === normalizedSelectedId
    return <button id={`quick-result-work-${work.id}`} tabIndex={-1} role="option" aria-selected={selected} className={selected ? 'is-active' : ''} key={work.id} onPointerMove={() => selectWithPointer(item.id)} onClick={() => run(item)}><WorkCover work={work} compact /><span><strong>{work.title}</strong><small>{STATUS_LABELS[work.userStatus]} · {formatChapter(work.lastReadChapter?.label)}</small></span>{work.hiddenFromHome && <em>Oculta da Home</em>}</button>
  })}</section>
  const actionGroups = (trimmedQuery ? [{ label: 'Ações', items: actionItems }] : [
    { label: 'Ações recentes', items: actionItems.slice(0, recentItemCount) },
    { label: 'Sugestões', items: actionItems.slice(recentItemCount) }
  ]).map((group, groupIndex) => group.items.length > 0 && <section key={group.label} className="quick-search__group" role="group" aria-labelledby={`quick-actions-${groupIndex}`}><h3 id={`quick-actions-${groupIndex}`}>{group.label}</h3>{group.items.map((item) => {
    const { action } = item
    const selected = item.id === normalizedSelectedId
    return <button id={`quick-result-action-${action.id}`} tabIndex={-1} role="option" aria-selected={selected} className={selected ? 'is-active' : ''} key={action.id} onPointerMove={() => selectWithPointer(item.id)} onClick={() => run(item)}><span className="quick-search__action-icon"><Icon name={action.icon} /></span><span><strong>{action.label}</strong><small>{action.kind === 'navigate' ? 'Navegação' : action.kind === 'work' && !currentWorkId ? 'Escolher obra' : 'Ação'}</small></span>{action.shortcut && <kbd>{action.shortcut}</kbd>}</button>
  })}</section>)

  return <><Dialog open={open} title="Ações rápidas" onClose={onClose} closeButton dismissOnBackdrop>
    <div className="quick-search">
      {workCommand && <div className="quick-search__scope"><Button variant="ghost" icon="chevron-left" onClick={() => { resetResultsPosition(); setWorkCommand(null); setQuery(''); setSelectedId(null); input.current?.focus() }}>Todas as ações</Button><span>{workCommand.label}</span></div>}
      <label className="quick-search__field"><Icon name="search" /><input ref={input} data-dialog-initial-focus role="combobox" aria-autocomplete="list" aria-expanded={items.length > 0} value={query} onChange={(event) => changeQuery(event.target.value)} onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); selectWithKeyboard(items[(active + 1) % items.length].id) }
        if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); selectWithKeyboard(items[(active - 1 + items.length) % items.length].id) }
        if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) run(items[active]) }
      }} placeholder={workCommand ? 'Pesquisar uma obra…' : 'Pesquisar obras ou ações…'} aria-label={workCommand ? 'Pesquisar uma obra' : 'Pesquisar obras ou ações'} aria-controls="quick-search-results" aria-activedescendant={normalizedSelectedId ? `quick-result-${normalizedSelectedId.replace(':', '-')}` : undefined} /><span className="quick-search__activity" role="status">{searching && <><i aria-hidden="true" /><span className="sr-only">Pesquisando obras</span></>}</span><kbd>Esc</kbd></label>
      <div ref={results} id="quick-search-results" className="quick-search__results" role="listbox" aria-label="Resultados da busca rápida">
        <div ref={entries} className="quick-search__entries" role="presentation">
          {phase === 'empty' && <p className="quick-search__state">Nenhuma obra ou ação encontrada.</p>}
          {phase === 'error' && <div className="quick-search__state" role="alert"><p>Não foi possível consultar a Biblioteca.</p><Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div>}
          {trimmedQuery ? <>{actionGroups}{workGroup}</> : <>{actionGroups[0]}{workGroup}{actionGroups[1]}</>}
          {workCommand && !trimmedQuery && !visibleWorks.length && <p className="quick-search__state">Digite o título da obra para continuar.</p>}
        </div>
      </div>
      <footer className="quick-search__hint"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> executar</span><span><kbd>Esc</kbd> fechar</span></footer>
    </div>
  </Dialog>{resume.dialog}</>
}
