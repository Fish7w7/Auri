import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const DEFAULT_SETTINGS: AppSettings = { libraryView: 'grid', librarySort: 'last_read_desc', cardSize: 'medium', sidebarCompact: false, coverCacheMaxMb: 500, backupAutomatic: true, backupFrequency: 'daily', backupRetention: 10, backupDirectory: null }
const EMPTY_SUMMARY: LibrarySummary = { total: 0, favorite: 0, byStatus: { want_to_read: 0, reading: 0, paused: 0, waiting: 0, completed: 0, dropped: 0 } }

export function App() {
  return <div className="window-frame"><WindowTitleBar /><ToastProvider><AppShell /></ToastProvider></div>
}

function AppShell() {
  const route = useRoute()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [ready, setReady] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const settingsUpdateQueue = useRef<Promise<void>>(Promise.resolve())

  const loadSummary = useCallback(async () => {
    try { setSummary(await window.lumi.library.summary()) } catch { /* páginas mostram o erro de dados */ }
  }, [])
  useEffect(() => {
    void Promise.all([window.lumi.settings.get().then(setSettings), loadSummary()]).finally(() => setReady(true))
  }, [loadSummary])

  const refreshData = useCallback(() => {
    void loadSummary()
    window.dispatchEvent(new Event('lumi:data-changed'))
  }, [loadSummary])
  const updateSettings = useCallback(async (patch: UpdateSettingsRequest) => {
    const operation = settingsUpdateQueue.current.then(async () => {
      const next = await window.lumi.settings.update(patch)
      setSettings(next)
    })
    settingsUpdateQueue.current = operation.catch(() => undefined)
    await operation
  }, [])
  const context = useMemo(() => ({ settings, summary, updateSettings, refreshData, openAddWork: () => setAddOpen(true) }), [refreshData, settings, summary, updateSettings])

  if (!ready) return <div className="app-loading"><div className="brand-mark brand-mark--large">L</div><span>Preparando sua biblioteca…</span></div>

  return <AppContext.Provider value={context}><KeyboardShortcutsProvider onQuickSearch={() => setQuickSearchOpen(true)} onAddWork={() => setAddOpen(true)} canAddWork={route.page !== 'settings'}><div className="app-shell">
      <Sidebar route={route} summary={summary} compact={settings.sidebarCompact} onToggleCompact={() => void updateSettings({ sidebarCompact: !settings.sidebarCompact })} />
      <main className="app-content" id="main-content">
        {route.page === 'home' && <HomePage />}
        {route.page === 'library' && <LibraryPage key={`${route.status ?? 'all'}:${route.favorite ?? false}:${route.sort ?? 'default'}`} initialStatus={route.status} initialFavorite={route.favorite} initialSort={route.sort} />}
        {route.page === 'trash' && <TrashPage />}
        {route.page === 'settings' && <SettingsPage />}
        {route.page === 'collections' && <CollectionsPage collectionId={route.id} />}
        {route.page === 'work' && <WorkPage id={route.id} />}
      </main>
      <AddWorkDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={refreshData} />
      <QuickSearchDialog open={quickSearchOpen} onClose={() => setQuickSearchOpen(false)} />
    </div></KeyboardShortcutsProvider></AppContext.Provider>
}
