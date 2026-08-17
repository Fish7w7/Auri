import { useCallback, useEffect, useState } from 'react'
import type { HomeData, Work } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { navigate } from '../app/navigation'
import { WorkCard } from '../components/work/WorkCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useWorkActions } from '../hooks/use-work-actions'
import { getVisibleHomeSections } from '../lib/home-sections'

const EMPTY_HOME: HomeData = { continueReading: [], staleReading: [], waiting: [], recentlyAdded: [] }

function HomeSection({ title, subtitle, works, actions }: { title: string; subtitle?: string; works: Work[]; actions: ReturnType<typeof useWorkActions>['handlers'] }) {
  if (!works.length) return null
  return <section className="home-section"><div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div><div className="home-work-grid">{works.map((work) => <WorkCard key={work.id} work={work} {...actions} />)}</div></section>
}

export function HomePage() {
  const { summary, refreshData, openAddWork } = useAppContext()
  const [data, setData] = useState<HomeData>(EMPTY_HOME)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const load = useCallback(async () => { try { setData(await window.lumi.library.home()); setState('ready') } catch { setState('error') } }, [])
  useEffect(() => { void load(); const handler = () => void load(); window.addEventListener('lumi:data-changed', handler); return () => window.removeEventListener('lumi:data-changed', handler) }, [load])
  const refresh = useCallback(() => { refreshData(); void load() }, [load, refreshData])
  const actions = useWorkActions(refresh)

  if (state === 'loading') return <div className="page"><LoadingState label="Organizando sua leitura…" /></div>
  if (state === 'error') return <div className="page"><ErrorState onRetry={() => void load()} /></div>
  if (summary.total === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Bem-vindo ao Lumi</span><h1>Home</h1></div></header><EmptyState title="Sua biblioteca ainda está vazia." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" onClick={openAddWork}>Adicionar obra</Button>} /></div>

  return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1><p>Retome de onde parou.</p></div><Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button></header>
    {getVisibleHomeSections(data).map((section) => <HomeSection key={section.key} title={section.title} subtitle={section.subtitle} works={section.works} actions={actions.handlers} />)}
    {actions.dialog}
  </div>
}
