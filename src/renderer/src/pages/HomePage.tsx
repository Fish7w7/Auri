import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeData, Source, Work } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { useAppContext } from '../app/app-context'
import { navigate, navigateToWork } from '../app/navigation'
import { HomeWorkCard } from '../components/home/HomeWorkCard'
import { AlternativeSourceDialog } from '../components/work/AlternativeSourceDialog'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { useWorkActions } from '../hooks/use-work-actions'
import { mapDomainError } from '../lib/format'
import { getVisibleHomeSections } from '../lib/home-sections'
import type { HomeSectionModel } from '../lib/home-sections'
import { listEligibleReadingSources, openReadingSource, selectBestReadingSource } from '../lib/source-selection'
import { subscribeToDataChanges } from '../app/data-changes'
import { HomeCustomizationDialog } from '../components/home/HomeCustomizationDialog'
import { unpinHomeCollection } from '@shared/home-preferences'

const EMPTY_HOME: HomeData = { continueReading: [], recent: [], favorites: [], recentlyAdded: [], pinnedCollections: [] }

export function excludeWorkFromHome(data: HomeData, workId: string): HomeData {
  return {
    continueReading: data.continueReading.filter((work) => work.id !== workId),
    recent: data.recent.filter((work) => work.id !== workId),
    favorites: data.favorites.filter((work) => work.id !== workId),
    recentlyAdded: data.recentlyAdded.filter((work) => work.id !== workId),
    pinnedCollections: data.pinnedCollections.map((section) => ({ ...section, works: section.works.filter((work) => work.id !== workId) }))
  }
}

function HomeSection({ section, actions, onContinue, onHide }: { section: HomeSectionModel; actions: ReturnType<typeof useWorkActions>['handlers']; onContinue(work: Work): void; onHide(work: Work): void }) {
  const columnCount = Math.min(section.works.length, 4)
  return <section className={`home-section home-section--${columnCount}-columns`}><div className="section-heading"><div><h2>{section.title}</h2></div>{section.viewAllPath && <Button variant="ghost" onClick={() => navigate(section.viewAllPath!)}>{section.key === 'continueReading' || section.key === 'favorites' || section.key === 'recentlyAdded' ? 'Ver todas' : 'Abrir coleção'}</Button>}</div>{section.works.length > 0 ? <div className="home-work-grid">{section.works.map((work) => <HomeWorkCard key={work.id} work={work} showLastReadNote={section.key === 'continueReading'} onOpen={actions.onOpen} onIncrement={actions.onIncrement} onContinue={onContinue} onHide={onHide} />)}</div> : <div className="home-section__empty"><strong>{section.emptyTitle}</strong>{section.emptyDescription && <span>{section.emptyDescription}</span>}{section.key === 'continueReading' && <Button onClick={() => navigate('/library')}>Abrir Biblioteca</Button>}</div>}</section>
}

export function HomePage() {
  const { settings, summary, refreshData, openAddWork, updateSettings } = useAppContext()
  const { showToast } = useToast()
  const [data, setData] = useState<HomeData>(EMPTY_HOME)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [alternativeSources, setAlternativeSources] = useState<Source[]>([])
  const [customizing, setCustomizing] = useState(false)
  const hasData = useRef(false)
  const load = useCallback(async () => { try {
    const next = await window.auri.library.home({ recentWorkIds: settings.recentWorkIds, pinnedCollectionIds: settings.homePreferences.pinnedCollectionIds, includeHiddenRecent: false })
    hasData.current = true; setData(next); setState('ready')
    const existing = new Set(next.pinnedCollections.map((item) => item.collection.id))
    const orphan = settings.homePreferences.pinnedCollectionIds.find((id) => !existing.has(id))
    if (orphan) void updateSettings({ homePreferences: unpinHomeCollection(settings.homePreferences, orphan) })
  } catch { if (!hasData.current) setState('error') } }, [settings.homePreferences, settings.recentWorkIds, updateSettings])
  useEffect(() => { void load(); return subscribeToDataChanges(() => void load()) }, [load])
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const actions = useWorkActions(refresh, (work) => navigateToWork(work.id, 'home'))
  const sections = getVisibleHomeSections(data, settings.homePreferences)

  async function openSource(source: Source, availableSources: Source[]): Promise<boolean> {
    try {
      await openReadingSource(source, {
        openExternal: (url) => window.auri.shell.openExternal({ url }),
        markUsed: (sourceId) => window.auri.sources.markUsed({ sourceId })
      })
      refreshData()
      return true
    } catch {
      const alternatives = listEligibleReadingSources(availableSources).filter((candidate) => candidate.id !== source.id)
      showToast({
        kind: 'error',
        message: 'Não foi possível abrir esta fonte.',
        ...(alternatives.length ? { action: { label: 'Escolher outra', onClick: () => setAlternativeSources(alternatives) } } : {})
      })
      return false
    }
  }

  async function continueReading(work: Work) {
    try {
      const sources = await window.auri.sources.list({ workId: work.id })
      const eligible = listEligibleReadingSources(sources)
      const source = eligible.find((candidate) => candidate.isPreferred) ?? selectBestReadingSource(sources)
      if (!source) {
        navigateToWork(work.id, 'home')
        return
      }
      await openSource(source, sources)
    } catch (error) {
      showToast({ kind: 'error', message: mapDomainError(error) })
    }
  }

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
    {sections.map((section) => <HomeSection key={section.key} section={section} actions={actions.handlers} onContinue={(work) => void continueReading(work)} onHide={(work) => void hideFromHome(work)} />)}
    {sections.length === 0 && <EmptyState title="Nenhuma seção está visível na Home." description="Use Editar Home para escolher o que deseja mostrar." action={<Button onClick={() => setCustomizing(true)}>Editar Home</Button>} />}
    {actions.dialog}
    <AlternativeSourceDialog open={alternativeSources.length > 0} sources={alternativeSources} onClose={() => setAlternativeSources([])} onOpen={(source) => openSource(source, alternativeSources)} />
    <HomeCustomizationDialog open={customizing} onClose={() => setCustomizing(false)} />
  </div>
}
