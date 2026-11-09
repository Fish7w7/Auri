import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeData, Work } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { useAppContext } from '../app/app-context'
import { navigate, navigateToWork } from '../app/navigation'
import { HomeWorkCard } from '../components/home/HomeWorkCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { useWorkActions } from '../hooks/use-work-actions'
import { useReadingResume } from '../hooks/use-reading-resume'
import { mapDomainError } from '../lib/format'
import { getVisibleHomeSections } from '../lib/home-sections'
import type { HomeSectionModel } from '../lib/home-sections'
import { subscribeToDataChanges } from '../app/data-changes'
import { HomeCustomizationDialog } from '../components/home/HomeCustomizationDialog'
import { unpinHomeCollection } from '@shared/home-preferences'

const EMPTY_HOME: HomeData = { continueReading: [], reading: {}, recent: [], favorites: [], recentlyAdded: [], pinnedCollections: [] }

export function excludeWorkFromHome(data: HomeData, workId: string): HomeData {
  return {
    continueReading: data.continueReading.filter((work) => work.id !== workId),
    reading: Object.fromEntries(Object.entries(data.reading).filter(([id]) => id !== workId)),
    recent: data.recent.filter((work) => work.id !== workId),
    favorites: data.favorites.filter((work) => work.id !== workId),
    recentlyAdded: data.recentlyAdded.filter((work) => work.id !== workId),
    pinnedCollections: data.pinnedCollections.map((section) => ({ ...section, works: section.works.filter((work) => work.id !== workId) }))
  }
}

function HomeSection({ section, actions, reading, resume, onHide }: { section: HomeSectionModel; actions: ReturnType<typeof useWorkActions>['handlers']; reading?: HomeData['reading']; resume: ReturnType<typeof useReadingResume>; onHide(work: Work): void }) {
  const columnCount = Math.min(section.works.length, 4)
  return <section className={`home-section home-section--${columnCount}-columns`}><div className="section-heading"><div><h2>{section.title}</h2></div>{section.viewAllPath && <Button variant="ghost" onClick={() => navigate(section.viewAllPath!)}>{section.key === 'continueReading' || section.key === 'favorites' || section.key === 'recentlyAdded' ? 'Ver todas' : 'Abrir coleção'}</Button>}</div>{section.works.length > 0 ? <div className="home-work-grid">{section.works.map((work) => <HomeWorkCard key={work.id} work={work} showLastReadNote={!!reading} reading={reading?.[work.id]} resumeBusy={resume.busy} onOpen={actions.onOpen} onIncrement={actions.onIncrement} onContinue={() => void resume.open(work.id, () => actions.onOpen(work))} onChooseSource={() => void resume.choose(work.id, () => actions.onOpen(work))} onHide={onHide} />)}</div> : <div className="home-section__empty"><strong>{section.emptyTitle}</strong>{section.emptyDescription && <span>{section.emptyDescription}</span>}{section.key === 'continueReading' && <Button onClick={() => navigate('/library')}>Abrir Biblioteca</Button>}</div>}</section>
}

export function HomePage({ onInitialReady }: { onInitialReady?: () => void } = {}) {
  const { settings, summary, refreshData, openAddWork, updateSettings } = useAppContext()
  const { showToast } = useToast()
  const [data, setData] = useState<HomeData>(EMPTY_HOME)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [customizing, setCustomizing] = useState(false)
  const hasData = useRef(false)
  const loadRevision = useRef(0)
  const load = useCallback(async () => {
    const revision = ++loadRevision.current
    try {
      const next = await window.auri.library.home({ recentWorkIds: settings.recentWorkIds, pinnedCollectionIds: settings.homePreferences.pinnedCollectionIds, includeHiddenRecent: false })
      if (revision !== loadRevision.current) return
      hasData.current = true
      setData(next)
      setState('ready')
      const existing = new Set(next.pinnedCollections.map((item) => item.collection.id))
      const orphan = settings.homePreferences.pinnedCollectionIds.find((id) => !existing.has(id))
      if (orphan) void updateSettings({ homePreferences: unpinHomeCollection(settings.homePreferences, orphan) })
    } catch {
      if (revision === loadRevision.current && !hasData.current) setState('error')
    }
  }, [settings.homePreferences, settings.recentWorkIds, updateSettings])
  useEffect(() => {
    void load()
    const unsubscribe = subscribeToDataChanges(() => void load())
    return () => { loadRevision.current += 1; unsubscribe() }
  }, [load])
  useEffect(() => { if (state !== 'loading') onInitialReady?.() }, [onInitialReady, state])
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const resume = useReadingResume(refresh)
  const actions = useWorkActions(refresh, (work) => navigateToWork(work.id, 'home'))
  const sections = getVisibleHomeSections(data, settings.homePreferences)

  async function hideFromHome(work: Work) {
    setData((current) => excludeWorkFromHome(current, work.id))
    try {
      await window.auri.works.update({ id: work.id, hiddenFromHome: true })
      refreshData()
      showToast({
        kind: 'info',
        message: 'Obra ocultada da Home',
        dedupeKey: `home-hidden-${work.id}`,
        action: {
          label: 'Desfazer',
          onClick: async () => {
            await window.auri.works.update({ id: work.id, hiddenFromHome: false })
            refreshData()
          }
        }
      })
    } catch (error) {
      await load()
      showToast({ kind: 'error', message: mapDomainError(error) })
    }
  }

  if (state === 'loading') return <div className="page"><LoadingState label="Organizando sua leitura…" /></div>
  if (state === 'error') return <div className="page"><ErrorState onRetry={() => void load()} /></div>
  if (summary.total === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Bem-vindo ao {APP_BRAND.name}</span><h1>Home</h1><p>Continue de onde parou e acesse sua biblioteca rapidamente.</p></div><Button onClick={() => setCustomizing(true)}>Editar Home</Button></header><EmptyState title="Sua biblioteca ainda está vazia." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" title="Adicionar obra (Ctrl+N)" onClick={openAddWork}>Adicionar obra</Button>} /><HomeCustomizationDialog open={customizing} onClose={() => setCustomizing(false)} /></div>

  return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1><p>Continue de onde parou e acesse sua biblioteca rapidamente.</p></div><div className="page-header__actions"><Button onClick={() => setCustomizing(true)}>Editar Home</Button><Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button></div></header>
    {sections.map((section) => <HomeSection key={section.key} section={section} actions={actions.handlers} reading={section.key === 'continueReading' ? data.reading : undefined} resume={resume} onHide={(work) => void hideFromHome(work)} />)}
    {sections.length === 0 && <EmptyState title="Nenhuma seção está visível na Home." description="Use Editar Home para escolher o que deseja mostrar." action={<Button onClick={() => setCustomizing(true)}>Editar Home</Button>} />}
    {actions.dialog}
    {resume.dialog}
    <HomeCustomizationDialog open={customizing} onClose={() => setCustomizing(false)} />
  </div>
}
