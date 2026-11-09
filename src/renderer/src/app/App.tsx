import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { AppSettings, LibrarySummary, UpdateSettingsRequest } from '@shared/contracts'
import { AppContext } from './app-context'
import { useRoute } from './navigation'
import { Sidebar } from '../components/shell/Sidebar'
import { AddWorkDialog } from '../components/work/AddWorkDialog'
import { ToastProvider } from '../components/ui/Toast'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { TrashPage } from '../pages/TrashPage'
import { SettingsPage } from '../pages/SettingsPage'
import { WorkPage } from '../pages/WorkPage'
import { CollectionsPage } from '../pages/CollectionsPage'
import { StatisticsPage } from '../pages/StatisticsPage'
import { KeyboardShortcutsProvider } from './keyboard-shortcuts'
import { QuickSearchDialog } from '../components/library/QuickSearchDialog'
import { WindowTitleBar } from '../components/shell/WindowTitleBar'
import { StartupIntro } from '../components/shell/StartupIntro'
import { navigate } from './navigation'
import { INITIAL_ADD_WORK_DIALOG_STATE, reduceAddWorkDialogState } from './add-work-dialog-state'
import { dispatchDataChanged } from './data-changes'
import { recordRecentWork } from '@shared/home-preferences'
import { getActiveLibraryNavigationSnapshot } from './navigation-session'
import { navigateToWork } from './navigation'
import type { WorkCommand } from '../lib/quick-search'

const DEFAULT_SETTINGS: AppSettings = { libraryView: 'grid', librarySort: 'last_read_desc', cardSize: 'medium', sidebarCompact: false, cinematicIntro: true, closeToTray: false, coverCacheMaxMb: 500, backupAutomatic: true, backupFrequency: 'daily', backupRetention: 10, backupDirectory: null, homePreferences: { sectionOrder: ['continueReading', 'recent', 'favorites', 'recentlyAdded'], enabledSections: { continueReading: true, recent: true, favorites: true, recentlyAdded: false }, pinnedCollectionIds: [] }, recentWorkIds: [] }
const EMPTY_SUMMARY: LibrarySummary = { total: 0, favorite: 0, byStatus: { want_to_read: 0, reading: 0, paused: 0, waiting: 0, completed: 0, dropped: 0 } }

export function App() {
  return <div className="window-frame"><WindowTitleBar /><ToastProvider><AppShell /></ToastProvider></div>
}

function AppShell() {
  const route = useRoute()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [ready, setReady] = useState(false)
  const [startupFailed, setStartupFailed] = useState(false)
  const [initialPage, setInitialPage] = useState('')
  const [introComplete, setIntroComplete] = useState(false)
  const [cinematic] = useState(() => window.auriStartup?.cinematic === true
    && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type !== 'reload')
  const completeIntro = useCallback(() => setIntroComplete(true), [])
  const markHomeReady = useCallback(() => setInitialPage('home'), [])
  const workId = route.page === 'work' ? route.id : null
  const markWorkReady = useCallback(() => setInitialPage(`work:${workId}`), [workId])
  const [addDialog, dispatchAddDialog] = useReducer(reduceAddWorkDialogState, INITIAL_ADD_WORK_DIALOG_STATE)
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [workCommand, setWorkCommand] = useState<{ id: string; action: WorkCommand } | null>(null)
  const clearWorkCommand = useCallback(() => setWorkCommand(null), [])
  const settingsUpdateQueue = useRef<Promise<void>>(Promise.resolve())

  const loadSummary = useCallback(async () => {
    try { setSummary(await window.auri.library.summary()) } catch { /* páginas mostram o erro de dados */ }
  }, [])
  useEffect(() => {
    let active = true
    async function initialize() {
      if (window.auriStartup && !await window.auriStartup.waitForServices()) throw new Error('Serviços indisponíveis.')
      if (!active) return
      const [settingsResult] = await Promise.allSettled([window.auri.settings.get(), loadSummary()])
      if (!active) return
      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value)
      setReady(true)
    }
    void initialize().catch(() => { if (active) setStartupFailed(true) })
    return () => { active = false }
  }, [loadSummary])
  const refreshData = useCallback(() => {
    void loadSummary()
    dispatchDataChanged()
  }, [loadSummary])
  useEffect(() => {
    const removeOpenWork = window.auri.desktopCommands.onOpenWork((workId) => {
      setQuickSearchOpen(false)
      setWorkCommand(null)
      navigate(`/work/${workId}`)
    })
    const removeOpenAddWork = window.auri.desktopCommands.onOpenAddWork((draft) => {
      setQuickSearchOpen(false)
      setWorkCommand(null)
      dispatchAddDialog({ type: 'open-external', draft })
    })
    const removeWorkChanged = window.auri.desktopCommands.onWorkChanged((change) => {
      void loadSummary()
      dispatchDataChanged(change)
    })
    return () => { removeOpenWork(); removeOpenAddWork(); removeWorkChanged() }
  }, [loadSummary])
  const updateSettings = useCallback(async (patch: UpdateSettingsRequest) => {
    const operation = settingsUpdateQueue.current.then(async () => {
      const next = await window.auri.settings.update(patch)
      setSettings(next)
    })
    settingsUpdateQueue.current = operation.catch(() => undefined)
    await operation
  }, [])
  useEffect(() => {
    if (!ready || route.page !== 'work') return
    const next = recordRecentWork(settings.recentWorkIds, route.id)
    if (next.length === settings.recentWorkIds.length && next.every((id, index) => id === settings.recentWorkIds[index])) return
    void updateSettings({ recentWorkIds: next })
  }, [ready, route, settings.recentWorkIds, updateSettings])
  const openWorkFromQuickSearch = useCallback((workId: string) => {
    if (route.page === 'home') navigateToWork(workId, 'home')
    else if (route.page === 'library' || route.page === 'collections') {
      const snapshot = getActiveLibraryNavigationSnapshot()
      if (snapshot) navigateToWork(workId, 'library', snapshot)
      else navigateToWork(workId, 'direct')
    } else navigateToWork(workId, route.page === 'statistics' ? 'statistics' : 'direct')
  }, [route])
  const openWorkCommand = (id: string, action: WorkCommand) => {
    setWorkCommand({ id, action })
    if (workId !== id) openWorkFromQuickSearch(id)
  }
  const context = useMemo(() => ({ settings, summary, updateSettings, refreshData, openAddWork: () => dispatchAddDialog({ type: 'open-manual' }), openWorkFromQuickSearch }), [openWorkFromQuickSearch, refreshData, settings, summary, updateSettings])

  if (startupFailed) throw new Error('Não foi possível iniciar os serviços do Auri.')

  const pageReady = route.page === 'home' ? initialPage === 'home'
    : route.page === 'work' ? initialPage === `work:${route.id}` : true

  return <>
    {ready && <AppContext.Provider value={context}><KeyboardShortcutsProvider paused={!introComplete} onQuickSearch={() => {
    if (quickSearchOpen) document.querySelector<HTMLInputElement>('.quick-search input')?.focus()
    else setQuickSearchOpen(true)
  }} onAddWork={() => dispatchAddDialog({ type: 'open-manual' })} canAddWork={route.page !== 'settings'}><div className="app-shell" inert={!introComplete}>
      <Sidebar route={route} summary={summary} compact={settings.sidebarCompact} onToggleCompact={() => void updateSettings({ sidebarCompact: !settings.sidebarCompact })} />
      <main className="app-content" id="main-content">
        {route.page === 'home' && <HomePage onInitialReady={introComplete ? undefined : markHomeReady} />}
        {route.page === 'library' && <LibraryPage key={`${route.status ?? 'all'}:${route.favorite ?? false}:${route.sort ?? 'default'}`} initialStatus={route.status} initialFavorite={route.favorite} initialSort={route.sort} />}
        {route.page === 'trash' && <TrashPage />}
        {route.page === 'settings' && <SettingsPage key={route.section ?? 'appearance'} initialSection={route.section} />}
        {route.page === 'collections' && <CollectionsPage collectionId={route.id} />}
        {route.page === 'statistics' && <StatisticsPage />}
        {route.page === 'work' && <WorkPage key={route.id} id={route.id} command={workCommand?.id === route.id ? workCommand.action : undefined} onCommandHandled={clearWorkCommand} onInitialReady={introComplete ? undefined : markWorkReady} />}
      </main>
      <AddWorkDialog open={introComplete && addDialog.open} draft={addDialog.draft} onClose={() => dispatchAddDialog({ type: 'close' })} onCreated={refreshData} />
      <QuickSearchDialog open={quickSearchOpen} onClose={() => setQuickSearchOpen(false)} currentWorkId={workId ?? undefined} onWorkCommand={openWorkCommand} />
    </div></KeyboardShortcutsProvider></AppContext.Provider>}
    {!introComplete && <StartupIntro cinematic={cinematic} ready={ready && pageReady} onComplete={completeIntro} />}
  </>
}
