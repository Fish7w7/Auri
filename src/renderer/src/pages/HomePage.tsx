import { useCallback, useEffect, useState } from 'react'
import type { HomeData, Work } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { navigate } from '../app/navigation'
import { HomeWorkCard } from '../components/home/HomeWorkCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useWorkActions } from '../hooks/use-work-actions'
import { getVisibleHomeSections } from '../lib/home-sections'
import type { HomeSectionModel } from '../lib/home-sections'
import { selectBestReadingSource } from '../lib/source-selection'
import { mapDomainError } from '../lib/format'
import { useToast } from '../components/ui/Toast'
import { APP_BRAND } from '@shared/constants/app-branding'

const EMPTY_HOME: HomeData = { continueReading: [], staleReading: [], waiting: [], recentlyAdded: [] }

function HomeSection({ section, actions, onContinue }: { section: HomeSectionModel; actions: ReturnType<typeof useWorkActions>['handlers']; onContinue(work: Work): void }) {
  const columnCount = Math.min(section.works.length, 4)
  return <section className={`home-section home-section--${columnCount}-columns`}><div className="section-heading"><div><h2>{section.title}</h2>{section.subtitle && <p>{section.subtitle}</p>}</div>{section.viewAllPath && <Button variant="ghost" onClick={() => navigate(section.viewAllPath!)}>Ver todas</Button>}</div><div className="home-work-grid">{section.works.map((work) => <HomeWorkCard key={work.id} work={work} showLastReadNote={section.key === 'continueReading' || section.key === 'staleReading'} onOpen={actions.onOpen} onIncrement={actions.onIncrement} onContinue={onContinue} />)}</div></section>
}

export function HomePage() {
  const { summary, refreshData, openAddWork } = useAppContext()
  const { showToast } = useToast()
  const [data, setData] = useState<HomeData>(EMPTY_HOME)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const load = useCallback(async () => { try { setData(await window.auri.library.home()); setState('ready') } catch { setState('error') } }, [])
  useEffect(() => { void load(); const handler = () => void load(); window.addEventListener('auri:data-changed', handler); return () => window.removeEventListener('auri:data-changed', handler) }, [load])
  const refresh = useCallback(() => { refreshData() }, [refreshData])
  const actions = useWorkActions(refresh)
  const sections = getVisibleHomeSections(data)

  async function continueReading(work: Work) {
    try {
      const source = selectBestReadingSource(await window.auri.sources.list({ workId: work.id }))
      const url = source?.lastReadUrl || source?.seriesUrl
      if (!url) {
        showToast({ kind: 'warning', message: 'Nenhuma fonte utilizável foi cadastrada para esta obra.', action: { label: 'Abrir obra', onClick: () => navigate(`/work/${work.id}`) } })
        return
      }
      await window.auri.shell.openExternal({ url })
    } catch (error) {
      showToast({ kind: 'error', message: mapDomainError(error) })
    }
  }

  if (state === 'loading') return <div className="page"><LoadingState label="Organizando sua leitura…" /></div>
  if (state === 'error') return <div className="page"><ErrorState onRetry={() => void load()} /></div>
  if (summary.total === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Bem-vindo ao {APP_BRAND.name}</span><h1>Home</h1></div></header><EmptyState title="Sua biblioteca ainda está vazia." description="Adicione sua primeira obra para começar a acompanhar suas leituras." action={<Button variant="primary" icon="plus" title="Adicionar obra (Ctrl+N)" onClick={openAddWork}>Adicionar obra</Button>} /></div>
  if (sections.length === 0) return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1></div></header><EmptyState title="Sua biblioteca ainda não tem leituras para continuar." description="Abra a Biblioteca para escolher o que ler a seguir." action={<Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button>} /></div>

  return <div className="page home-page"><header className="page-header"><div><span className="page-kicker">Sua leitura, no seu ritmo</span><h1>Home</h1><p>Retome de onde parou.</p></div><Button icon="library" onClick={() => navigate('/library')}>Ver Biblioteca</Button></header>
    {sections.map((section) => <HomeSection key={section.key} section={section} actions={actions.handlers} onContinue={(work) => void continueReading(work)} />)}
    {actions.dialog}
  </div>
}
