import { useCallback, useEffect, useState } from 'react'
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

const EMPTY_HOME: HomeData = { continueReading: [], staleReading: [], waiting: [], recentlyAdded: [] }

export function excludeWorkFromHome(data: HomeData, workId: string): HomeData {
  return {
    continueReading: data.continueReading.filter((work) => work.id !== workId),
    staleReading: data.staleReading.filter((work) => work.id !== workId),
    waiting: data.waiting.filter((work) => work.id !== workId),
    recentlyAdded: data.recentlyAdded.filter((work) => work.id !== workId)
  }
}

function HomeSection({ section, actions, onContinue, onHide }: { section: HomeSectionModel; actions: ReturnType<typeof useWorkActions>['handlers']; onContinue(work: Work): void; onHide(work: Work): void }) {
  const columnCount = Math.min(section.works.length, 4)
  return <section className={`home-section home-section--${columnCount}-columns`}><div className="section-heading"><div><h2>{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}</div>{section.viewAllPath && <Button variant="ghost" onClick={() => navigate(section.viewAllPath!)}>Ver todas</Button>}</div><div className="home-work-grid">{section.works.map((work) => <HomeWorkCard key={work.id} work={work} showLastReadNote={section.key === 'continueReading' || section.key === 'staleReading'} onOpen={actions.onOpen} onIncrement={actions.onIncrement} onContinue={onContinue} onHide={onHide} />)}</div></section>
}

export function HomePage() {
  const { summary, refreshData, openAddWork } = useAppContext()
  const { showToast } = useToast()
  const [data, setData] = useState<HomeData>(EMPTY_HOME)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [alternativeSources, setAlternativeSources] = useState<Source[]>([])
  const load = useCallback(async () => { try { setData(await window.auri.library.home()); setState('ready') } catch { setState('error') } }, [])
  useEffect(() => { void load(); return subscribeToDataChanges(() => void load()) }, [load])
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const actions = useWorkActions(refresh, (work) => navigateToWork(work.id, 'home'))
  const sections = getVisibleHomeSections(data)

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
      const source = selectBestReadingSource(sources)
      if (!source) {
        showToast({ kind: 'warning', message: 'Nenhuma fonte utilizável foi cadastrada para esta obra.', action: { label: 'Abrir obra', onClick: () => navigateToWork(work.id, 'home') } })
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
  if (summary.total === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Bem-vindo ao {APP_BRAND.name}</span><h1>Home</h1></div></header><EmptyState title="Sua biblioteca ainda está vazia." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" title="Adicionar obra (Ctrl+N)" onClick={openAddWork}>Adicionar obra</Button>} /></div>
  if (sections.length === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1></div></header><EmptyState title="Sua biblioteca ainda não tem leituras visíveis para continuar." description="Abra a Biblioteca ou as Configurações para escolher o que mostrar novamente." action={<Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button>} /></div>

  return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1><p>Retome de onde parou.</p></div><Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button></header>
    {sections.map((section) => <HomeSection key={section.key} section={section} actions={actions.handlers} onContinue={(work) => void continueReading(work)} onHide={(work) => void hideFromHome(work)} />)}
    {actions.dialog}
    <AlternativeSourceDialog open={alternativeSources.length > 0} sources={alternativeSources} onClose={() => setAlternativeSources([])} onOpen={(source) => openSource(source, alternativeSources)} />
  </div>
}
