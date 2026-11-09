import { useEffect, useState } from 'react'
import type { MediaType, ReadingStatistics, ReadingStatisticsRequest, UserStatus } from '@shared/contracts'
import { subscribeToDataChanges } from '../app/data-changes'
import { navigateToWork } from '../app/navigation'
import { ActivityChart } from '../components/statistics/ActivityChart'
import { WorkCover } from '../components/work/WorkCover'
import { Button } from '../components/ui/Button'
import { Icon, type IconName } from '../components/ui/Icon'
import { Select } from '../components/ui/Select'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { MEDIA_TYPE_LABELS, STATUS_LABELS } from '../lib/format'
import '../styles/statistics.css'

const PERIODS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 'all', label: 'Todo o período' }
] as const
const GROUP_OPTIONS = [{ value: 'day', label: 'Por dia' }, { value: 'week', label: 'Por semana' }, { value: 'month', label: 'Por mês' }]
const MEDIA_OPTIONS = [{ value: '', label: 'Todos os tipos' }, ...Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => ({ value, label }))]
const STATUS_OPTIONS = [{ value: '', label: 'Todos os status' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))]
const DEFAULT_FILTERS: ReadingStatisticsRequest = { period: 30, groupBy: 'day' }
const number = new Intl.NumberFormat('pt-BR')
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

type Snapshot = { filters: ReadingStatisticsRequest; data: ReadingStatistics | null; error: boolean }

export function StatisticsPage() {
  const [filters, setFilters] = useState<ReadingStatisticsRequest>(DEFAULT_FILTERS)
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let revision = 0
    const load = async () => {
      const request = ++revision
      try {
        const data = await window.auri.library.statistics(filters)
        if (request === revision) setSnapshot({ filters, data, error: false })
      } catch {
        if (request === revision) setSnapshot({ filters, data: null, error: true })
      }
    }
    void load()
    const unsubscribe = subscribeToDataChanges(() => void load())
    return () => { revision += 1; unsubscribe() }
  }, [filters, retry])

  const state = snapshot?.filters === filters ? snapshot : null
  const data = state?.data
  const resetFilters = () => setFilters(DEFAULT_FILTERS)
  return <div className="page statistics-page"><div className="statistics-dashboard">
    <header className="page-header"><div><span className="page-kicker">Seu ritmo de leitura</span><h1>Estatísticas</h1><p>Um panorama da sua biblioteca e do seu progresso ao longo do tempo.</p></div></header>
    <div className="statistics-filters" aria-label="Filtros das estatísticas">
      <div className="statistics-filter-group">
        <span className="statistics-filter-label">Período da atividade</span>
        <div className="statistics-periods" role="group" aria-label="Período da atividade">
          {PERIODS.map(({ value, label }) => <Button key={value} aria-pressed={filters.period === value}
            variant="ghost" onClick={() => setFilters({ ...filters, period: value, groupBy: value === 'all' ? 'month' : value === 90 ? 'week' : 'day' })}>{label}</Button>)}
        </div>
      </div>
      <div className="statistics-filter-group">
        <span className="statistics-filter-label">Biblioteca</span>
        <div className="statistics-selects" role="group" aria-label="Biblioteca">
          <Select label="Tipo de obra" options={MEDIA_OPTIONS} value={filters.mediaType ?? ''} onChange={(value) => setFilters({ ...filters, mediaType: value ? value as MediaType : undefined })} />
          <Select label="Status de leitura" options={STATUS_OPTIONS} value={filters.status ?? ''} onChange={(value) => setFilters({ ...filters, status: value ? value as UserStatus : undefined })} />
        </div>
      </div>
      <div className="statistics-filter-group">
        <span className="statistics-filter-label">Agrupamento</span>
        <Select label="Agrupar atividade" options={GROUP_OPTIONS} value={filters.groupBy} onChange={(value) => setFilters({ ...filters, groupBy: value as ReadingStatisticsRequest['groupBy'] })} />
      </div>
    </div>
    {!state && <LoadingState label="Calculando estatísticas…" />}
    {state?.error && <ErrorState title="Não foi possível carregar as estatísticas." onRetry={() => { setSnapshot(undefined); setRetry((value) => value + 1) }} />}
    {data && (data.library.total === 0
      ? <EmptyState title={filters.mediaType || filters.status ? 'Nenhuma obra corresponde a estes filtros.' : 'Sua biblioteca ainda está vazia.'}
        description="As estatísticas aparecem conforme você organiza suas obras e registra seu progresso."
        action={(filters.mediaType || filters.status) && <Button onClick={resetFilters}>Limpar filtros</Button>} />
      : <StatisticsContent data={data} groupBy={filters.groupBy} />)}
  </div></div>
}

function StatisticsContent({ data, groupBy }: {
  data: ReadingStatistics
  groupBy: ReadingStatisticsRequest['groupBy']
}) {
  const { library, activity, timeline, ranking } = data
  return <>
    <section aria-labelledby="statistics-library">
      <div className="statistics-section-heading">
        <h2 id="statistics-library">Biblioteca atual</h2>
        <p>Panorama das obras para o tipo e o status selecionados.</p>
      </div>
      <dl className="statistics-totals">
        <Metric icon="library" label="Obras na biblioteca" value={library.total} note="Total de obras filtradas" />
        <Metric icon="check" label="Concluídas" value={library.completed} note="Marcadas como finalizadas" />
        <Metric icon="book-open" label="Leituras em aberto" value={library.inProgress} note="Lendo, pausadas ou esperando" />
        <Metric icon="bookmark" label="Ainda não iniciadas" value={library.notStarted} note="Quero ler, sem progresso" />
      </dl>
    </section>
    <section className="statistics-panel statistics-activity" aria-labelledby="statistics-activity">
      <div className="statistics-section-heading">
        <h2 id="statistics-activity">Atividade de leitura</h2>
        <p>Alterações de progresso no período selecionado.</p>
      </div>
      <dl className="statistics-activity__totals">
        <div><dt>Registros de progresso</dt><dd>{number.format(activity.records)}</dd></div>
        <div><dt>Atualizações</dt><dd>{number.format(activity.updates)}</dd></div>
        <div><dt>Avanços numéricos</dt><dd>{number.format(activity.advances)}</dd></div>
      </dl>
      {timeline.length > 0 ? <ActivityChart timeline={timeline} groupBy={groupBy} />
        : <div className="statistics-empty"><Icon name="chart" /><strong>Nenhuma alteração de progresso neste período</strong><span>Escolha outro período ou ajuste os filtros para consultar seu histórico.</span></div>}
      <p className="statistics-footnote">Cada aumento de progresso conta como um avanço, mesmo quando o número do capítulo salta.</p>
      {data.timelineTruncated && <p className="statistics-footnote">O gráfico exibe os 180 intervalos mais recentes. Os totais cobrem todo o período selecionado.</p>}
    </section>
    <div className="statistics-breakdown">
      <section className="statistics-panel" aria-labelledby="statistics-distribution">
        <div className="statistics-section-heading"><h2 id="statistics-distribution">Composição da biblioteca</h2><p>Participação de cada categoria nas obras filtradas.</p></div>
        <div className="statistics-distributions">
          <Distribution title="Por tipo de obra" labels={MEDIA_TYPE_LABELS} counts={library.byMediaType} total={library.total} donut />
          <Distribution title="Por status" labels={STATUS_LABELS} counts={library.byStatus} total={library.total} />
        </div>
      </section>
      <Ranking ranking={ranking} />
    </div>
  </>
}

function Metric({ icon, label, value, note }: { icon: IconName; label: string; value: number; note: string }) {
  return <div className="statistics-metric">
    <dt><Icon name={icon} />{label}</dt>
    <dd><strong>{number.format(value)}</strong><span>{note}</span></dd>
  </div>
}

function Distribution<Key extends string>({ title, labels, counts, total, donut = false }: {
  title: string; labels: Record<Key, string>; counts: Partial<Record<Key, number>>; total: number; donut?: boolean
}) {
  const entries = (Object.keys(labels) as Key[]).map((key, index) => ({
    key, label: labels[key], count: counts[key] ?? 0, color: `var(--statistics-category-${index + 1})`
  })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count)
  let end = 0
  const slices = entries.map(({ color, count }) => {
    const start = end
    end += count
    return `${color} ${start / total * 100}% ${end / total * 100}%`
  })
  return <div className="statistics-distribution">
    <h3>{title}</h3>
    {donut ? <div className="statistics-distribution__donut" aria-hidden="true" style={{ background: slices.length === 1 ? entries[0].color : `conic-gradient(${slices.join(', ')})` }}>
      <div><strong>{number.format(total)}</strong><span>{total === 1 ? 'obra' : 'obras'}</span></div>
    </div> : <div className="statistics-distribution__track" aria-hidden="true">
      {entries.map(({ key, color, count }) => <span key={key} style={{ flex: count, backgroundColor: color }} />)}
    </div>}
    <ul>
      {entries.map(({ key, label, count, color }) => <li key={key}>
        <span className="statistics-distribution__label"><i style={{ backgroundColor: color }} />{label}</span>
        <strong>{number.format(count)}</strong><span className="statistics-distribution__percentage">{percent.format(count / total)}</span>
      </li>)}
    </ul>
  </div>
}

function Ranking({ ranking }: { ranking: ReadingStatistics['ranking'] }) {
  const [expanded, setExpanded] = useState(false)
  return <section className="statistics-panel statistics-ranking" aria-labelledby="statistics-ranking">
    <div className="statistics-section-heading"><h2 id="statistics-ranking">Obras com mais atividade</h2><p>Ordenadas por registros de progresso no período.</p></div>
    {ranking.length > 0 ? <>
      <ol id="statistics-ranking-list">
        {(expanded ? ranking : ranking.slice(0, 5)).map((work, index) => {
          const count = `${number.format(work.records)} ${work.records === 1 ? 'registro' : 'registros'}`
          return <li key={work.workId}>
            <button type="button" aria-label={`${work.title}, ${count}`} onClick={() => navigateToWork(work.workId, 'statistics')}>
              <span className="statistics-ranking__position" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <WorkCover work={{ id: work.workId, title: work.title }} compact cacheOnly={false} fallbackToInitial />
              <span className="statistics-ranking__work"><strong title={work.title}>{work.title}</strong><span>{count}</span></span>
              <Icon name="chevron-right" className="statistics-ranking__arrow" />
            </button>
          </li>
        })}
      </ol>
      {ranking.length > 5 && <Button className="statistics-ranking__toggle" variant="ghost" icon={expanded ? 'chevron-up' : 'chevron-down'}
        aria-expanded={expanded} aria-controls="statistics-ranking-list" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Mostrar menos' : `Mostrar mais ${ranking.length - 5}`}
      </Button>}
    </> : <p className="statistics-ranking__empty">O ranking aparece quando houver registros no período.</p>}
  </section>
}
