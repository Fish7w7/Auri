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
import { KeyboardShortcutsProvider } from './keyboard-shortcuts'
import { QuickSearchDialog } from '../components/library/QuickSearchDialog'
import { WindowTitleBar } from '../components/shell/WindowTitleBar'
import { BrandMark } from '../components/shell/BrandMark'
import { StartupIntro } from '../components/shell/StartupIntro'
import { navigate } from './navigation'
import { INITIAL_ADD_WORK_DIALOG_STATE, reduceAddWorkDialogState } from './add-work-dialog-state'
import { dispatchDataChanged } from './data-changes'

const DEFAULT_SETTINGS: AppSettings = { libraryView: 'grid', librarySort: 'last_read_desc', cardSize: 'medium', sidebarCompact: false, closeToTray: false, coverCacheMaxMb: 500, backupAutomatic: true, backupFrequency: 'daily', backupRetention: 10, backupDirectory: null }
const EMPTY_SUMMARY: LibrarySummary = { total: 0, favorite: 0, byStatus: { want_to_read: 0, reading: 0, paused: 0, waiting: 0, completed: 0, dropped: 0 } }

export function App() {
  return <div className="window-frame"><WindowTitleBar /><ToastProvider><AppShell /></ToastProvider><StartupIntro /></div>
}

function AppShell() {
  const route = useRoute()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [ready, setReady] = useState(false)
  const [addDialog, dispatchAddDialog] = useReducer(reduceAddWorkDialogState, INITIAL_ADD_WORK_DIALOG_STATE)
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const settingsUpdateQueue = useRef<Promise<void>>(Promise.resolve())

  const loadSummary = useCallback(async () => {
    try { setSummary(await window.auri.library.summary()) } catch { /* páginas mostram o erro de dados */ }
  }, [])
  useEffect(() => {
    void Promise.all([window.auri.settings.get().then(setSettings), loadSummary()]).finally(() => setReady(true))
  }, [loadSummary])
  const refreshData = useCallback(() => {
    void loadSummary()
    dispatchDataChanged()
  }, [loadSummary])
  useEffect(() => {
    const removeOpenWork = window.auri.desktopCommands.onOpenWork((workId) => navigate(`/work/${workId}`))
    const removeOpenAddWork = window.auri.desktopCommands.onOpenAddWork((draft) => dispatchAddDialog({ type: 'open-external', draft }))
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
  const context = useMemo(() => ({ settings, summary, updateSettings, refreshData, openAddWork: () => dispatchAddDialog({ type: 'open-manual' }) }), [refreshData, settings, summary, updateSettings])

  if (!ready) return <div className="app-loading"><BrandMark large /><span>Preparando sua biblioteca…</span></div>

  return <AppContext.Provider value={context}><KeyboardShortcutsProvider onQuickSearch={() => setQuickSearchOpen(true)} onAddWork={() => dispatchAddDialog({ type: 'open-manual' })} canAddWork={route.page !== 'settings'}><div className="app-shell">
      <Sidebar route={route} summary={summary} compact={settings.sidebarCompact} onToggleCompact={() => void updateSettings({ sidebarCompact: !settings.sidebarCompact })} />
      <main className="app-content" id="main-content">
        {route.page === 'home' && <HomePage />}
        {route.page === 'library' && <LibraryPage key={`${route.status ?? 'all'}:${route.favorite ?? false}:${route.sort ?? 'default'}`} initialStatus={route.status} initialFavorite={route.favorite} initialSort={route.sort} />}
        {route.page === 'trash' && <TrashPage />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'collections' && <CollectionsPage collectionId={route.id} />}
        {route.page === 'work' && <WorkPage id={route.id} />}
      </main>
      <AddWorkDialog open={addDialog.open} draft={addDialog.draft} onClose={() => dispatchAddDialog({ type: 'close' })} onCreated={refreshData} />
      <QuickSearchDialog open={quickSearchOpen} onClose={() => setQuickSearchOpen(false)} />
    </div></KeyboardShortcutsProvider></AppContext.Provider>
}
