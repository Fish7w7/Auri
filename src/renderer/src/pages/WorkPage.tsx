import { useCallback, useEffect, useState } from 'react'
import type { ReadingHistory, Source, UserStatus, Work, WorkDetails } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { navigate } from '../app/navigation'
import { CoverDialog } from '../components/work/CoverDialog'
import { ProgressDialog } from '../components/work/ProgressDialog'
import { RelationDialog, type RelationKind } from '../components/work/RelationDialog'
import { SourceDialog } from '../components/work/SourceDialog'
import { WorkCover } from '../components/work/WorkCover'
import { WorkEditorDialog } from '../components/work/WorkEditorDialog'
import { MetadataRefreshDialog } from '../components/work/MetadataRefreshDialog'
import { Button, IconButton } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { KeyboardMenu } from '../components/ui/KeyboardMenu'
import { ErrorState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { Select } from '../components/ui/Select'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS, mapDomainError } from '../lib/format'
import { selectBestReadingSource } from '../lib/source-selection'

const SOURCE_STATUS = { active: 'Ativa', unavailable: 'Indisponível', archived: 'Arquivada' }
const LANGUAGES: Record<string, string> = { 'pt-BR': 'Português', pt: 'Português', en: 'Inglês', es: 'Espanhol', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês', other: 'Outro' }
const CREATOR_ROLES: Record<string, string> = { author: 'Autores', artist: 'Artistas', story: 'História', original_creator: 'Criadores originais', other: 'Outros' }
const COUNTRIES: Record<string, string> = { KR: 'Coreia do Sul', JP: 'Japão', CN: 'China', BR: 'Brasil', US: 'Estados Unidos' }

export function WorkPage({ id }: { id: string }) {
  const [details, setDetails] = useState<WorkDetails | null>(null)
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')
  const [history, setHistory] = useState<ReadingHistory[]>([])
  const [historyError, setHistoryError] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(20)
  const [dialog, setDialog] = useState<'edit' | 'progress' | 'source' | 'cover' | 'metadata' | null>(null)
  const [relation, setRelation] = useState<RelationKind | null>(null)
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const [deleteSource, setDeleteSource] = useState<Source | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const { refreshData } = useAppContext()
  const { showToast } = useToast()

  const loadDetails = useCallback(async () => {
    try { setDetails(await window.lumi.works.getDetails({ workId: id })); setPageState('ready') }
    catch (error) { const code = typeof error === 'object' && error && 'error' in error ? (error as { error?: { code?: string } }).error?.code : ''; setPageState(code === 'WORK_NOT_FOUND' ? 'not-found' : 'error') }
  }, [id])
  const loadHistory = useCallback(async () => { try { setHistory(await window.lumi.progress.history({ workId: id })); setHistoryError(false) } catch { setHistoryError(true) } }, [id])
  const reload = useCallback(() => { void loadDetails(); void loadHistory(); refreshData() }, [loadDetails, loadHistory, refreshData])
  useEffect(() => { setPageState('loading'); void loadDetails(); void loadHistory() }, [loadDetails, loadHistory])

  const bestSource = selectBestReadingSource(details?.sources ?? [])

  if (pageState === 'loading') return <WorkSkeleton />
  if (pageState === 'not-found') return <div className="page"><ErrorState title="Esta obra não foi encontrada." description="O endereço pode estar antigo ou a obra pode ter sido excluída permanentemente." onRetry={() => navigate('/library')} /></div>
  if (pageState === 'error' || !details) return <div className="page"><ErrorState title="Não foi possível carregar esta obra." description="Seus dados permanecem seguros no dispositivo." onRetry={() => void loadDetails()} /></div>
  const work = details.work

  if (work.deletedAt) return <div className="page trashed-work-state"><div className="brand-mark brand-mark--large">L</div><h1>Esta obra está na Lixeira.</h1><p>O progresso, o histórico, as fontes e as notas continuam preservados.</p><div><Button onClick={() => navigate('/library')}>Voltar à Biblioteca</Button><Button variant="primary" onClick={async () => { try { await window.lumi.works.restore({ workId: work.id }); showToast({ kind: 'success', message: `“${work.title}” foi restaurada.` }); reload() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }}>Restaurar</Button></div></div>

  const originalAlias = details.aliases.find((alias) => alias.kind === 'original') ?? details.aliases[0]
  const numericProgress = work.lastReadChapter?.number != null
  const syncedReference = details.externalRefs.find((reference) => reference.provider === 'anilist')

  async function updateFavorite() {
    const previous = details!
    const favorite = !work.favorite
    setDetails({ ...details!, work: { ...work, favorite } })
    try { await window.lumi.works.update({ id: work.id, favorite }); refreshData() }
    catch (error) { setDetails(previous); showToast({ kind: 'error', message: mapDomainError(error) }) }
  }
  async function updateStatus(userStatus: UserStatus) {
    const previous = details!
    setDetails({ ...details!, work: { ...work, userStatus } })
    try { await window.lumi.works.update({ id: work.id, userStatus }); refreshData() }
    catch (error) { setDetails(previous); showToast({ kind: 'error', message: mapDomainError(error) }) }
  }
  async function numeric(action: 'increment' | 'decrement') {
    try {
      const result = await window.lumi.progress[action]({ workId: work.id })
      if (!result.applied) return
      showToast({ kind: 'success', message: `Progresso atualizado para ${result.progress.chapter?.label}.`, action: { label: 'Desfazer', onClick: async () => { await window.lumi.progress.undo({ historyId: result.history.id }); reload(); showToast({ kind: 'info', message: 'Alteração desfeita.' }) } } }); reload()
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) }
  }
  async function openSource(source: Source) { const url = source.lastReadUrl || source.seriesUrl; if (!url) return; try { await window.lumi.shell.openExternal({ url }) } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }

  return <div className="page work-page">
    <div className="work-page__topbar"><Button variant="ghost" icon="chevron-left" onClick={() => navigate('/library')}>Biblioteca</Button><KeyboardMenu className="work-overflow" label="Mais ações"><button onClick={() => setDialog('edit')}>Editar obra</button>{syncedReference && <button onClick={() => setDialog('metadata')}>Atualizar metadados</button>}<button onClick={() => { setEditingSource(null); setDialog('source') }}>Gerenciar fontes</button><button onClick={() => setDialog('cover')}>Alterar capa</button><button className="is-danger" onClick={() => setTrashOpen(true)}>Mover para Lixeira</button></KeyboardMenu></div>

    <header className="work-hero"><WorkCover work={work} /><div className="work-hero__content"><div className="work-title-line"><div><span className="page-kicker">{MEDIA_TYPE_LABELS[work.mediaType]}</span><h1>{work.title}</h1>{originalAlias && <p className="work-original-title">{originalAlias.name}</p>}</div><IconButton icon="star" className={work.favorite ? 'is-favorite' : ''} label={work.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={() => void updateFavorite()} /></div><div className="work-meta-line"><span>{MEDIA_TYPE_LABELS[work.mediaType]}</span>{work.startDate && <span>{work.startDate.slice(0, 4)}</span>}{work.publicationStatus && <span>{PUBLICATION_LABELS[work.publicationStatus]}</span>}{syncedReference && <span title={syncedReference.lastSyncedAt ?? undefined}>AniList</span>}</div><label className="status-select"><span>Status pessoal</span><Select label="Status pessoal" value={work.userStatus} onChange={(value) => void updateStatus(value as UserStatus)} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label></div></header>

    <section className="progress-stage"><div><span>Último capítulo concluído</span><button className="progress-number" onClick={() => setDialog('progress')}>{work.lastReadChapter?.label ?? '—'}</button><small>{work.lastReadAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(work.lastReadAt)) : 'Ainda sem leitura registrada'}</small></div><div className="progress-controls"><IconButton label={numericProgress ? 'Voltar um capítulo' : 'Este progresso não possui um valor numérico.'} icon="chevron-left" disabled={!numericProgress} onClick={() => void numeric('decrement')} /><Button onClick={() => setDialog('progress')}>Editar</Button><Button variant="primary" disabled={!numericProgress} title={numericProgress ? 'Avançar um capítulo' : 'Este progresso não possui um valor numérico.'} onClick={() => void numeric('increment')}>+1</Button></div><Button className="continue-button" variant="primary" disabled={!bestSource} onClick={() => bestSource && void openSource(bestSource)}>Continuar lendo</Button></section>

    {!bestSource && <div className="no-source-callout"><div><strong>Nenhuma fonte cadastrada.</strong><p>Adicione o site onde você costuma ler esta obra.</p></div><Button icon="plus" onClick={() => { setEditingSource(null); setDialog('source') }}>Adicionar fonte</Button></div>}

    <div className="work-content">
      <NoteSection featured title="Onde parei" value={work.lastReadNote ?? ''} placeholder="Registre o ponto exato para retomar." onSave={async (value) => { await window.lumi.works.update({ id: work.id, lastReadNote: value || null }); reload() }} />
      <Section title="Sobre">{work.description ? <p className="work-description">{work.description}</p> : <EmptyInline text="Nenhuma descrição cadastrada." action="Adicionar descrição" onClick={() => setDialog('edit')} />}</Section>
      <Section title="Informações"><dl className="work-facts">{groupCreators(details).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{work.countryCode && <div><dt>Origem</dt><dd>{COUNTRIES[work.countryCode] ?? work.countryCode}</dd></div>}{work.publicationStatus && <div><dt>Publicação</dt><dd>{PUBLICATION_LABELS[work.publicationStatus]}</dd></div>}{work.startDate && <div><dt>Início</dt><dd>{work.startDate}</dd></div>}{work.endDate && <div><dt>Fim</dt><dd>{work.endDate}</dd></div>}{work.rating !== null && <div><dt>Minha nota</dt><dd>{work.rating}/10</dd></div>}</dl>{details.creators.length === 0 && !work.countryCode && !work.publicationStatus && !work.startDate && <EmptyInline text="Nenhuma informação adicional cadastrada." action="Editar obra" onClick={() => setDialog('edit')} />}</Section>
      <Section title="Títulos alternativos" action="Adicionar" onAction={() => setRelation('alias')}><ChipList items={details.aliases.map((alias) => ({ id: alias.id, label: alias.name, hint: alias.kind === 'original' ? 'Original' : 'Alternativo' }))} onRemove={(id) => void removeRelation(() => window.lumi.aliases.delete({ aliasId: id }), reload, showToast)} empty="Nenhum título alternativo." /></Section>
      <Section title="Gêneros" action="Adicionar" onAction={() => setRelation('genre')}><ChipList items={details.genres.map((genre) => ({ id: genre.id, label: genre.name }))} onRemove={(genreId) => void removeRelation(() => window.lumi.genres.removeFromWork({ workId: work.id, genreId }), reload, showToast)} empty="Nenhum gênero." /></Section>
      <Section title="Minhas tags" action="Adicionar" onAction={() => setRelation('tag')}><ChipList personal items={details.tags.map((tag) => ({ id: tag.id, label: tag.name }))} onRemove={(tagId) => void removeRelation(() => window.lumi.tags.removeFromWork({ workId: work.id, tagId }), reload, showToast)} empty="Nenhuma tag pessoal." /></Section>
      <Section title="Creators" action="Adicionar creator" onAction={() => setRelation('creator')}><div className="creator-list">{details.creators.map((creator) => <div key={creator.id}><span>{CREATOR_ROLES[creator.role]?.replace(/s$/, '') ?? creator.role}</span><strong>{creator.name}</strong><button aria-label={`Remover ${creator.name}`} onClick={() => void removeRelation(() => window.lumi.creators.delete({ creatorId: creator.id }), reload, showToast)}>×</button></div>)}</div>{details.creators.length === 0 && <p className="inline-empty">Nenhum creator cadastrado.</p>}</Section>
      <Section title="Coleções" action="Nova coleção" onAction={() => setRelation('collection')}><div className="collection-checklist">{details.allCollections.map((collection) => { const checked = details.collections.some((item) => item.id === collection.id); return <label key={collection.id}><input type="checkbox" checked={checked} onChange={async (event) => { try { if (event.target.checked) await window.lumi.collections.addWork({ workId: work.id, collectionId: collection.id }); else await window.lumi.collections.removeWork({ workId: work.id, collectionId: collection.id }); reload() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }} /><span>{collection.name}</span></label> })}{details.allCollections.length === 0 && <p className="inline-empty">Nenhuma coleção criada.</p>}</div></Section>
      <Section title="Fontes" action="Adicionar fonte" onAction={() => { setEditingSource(null); setDialog('source') }}><div className="source-list">{details.sources.map((source) => <article className={`source-row source-row--${source.status}`} key={source.id}><div className="source-row__main"><div><strong>{source.isPreferred && <span title="Fonte preferida">★ </span>}{source.name || source.domain}</strong><span>{SOURCE_STATUS[source.status]}</span></div><p>{LANGUAGES[source.language ?? ''] ?? source.language ?? 'Idioma não informado'} · {source.domain}</p>{source.lastUsedAt && <small>Último uso: {new Intl.DateTimeFormat('pt-BR').format(new Date(source.lastUsedAt))}</small>}</div><Button disabled={!source.lastReadUrl && !source.seriesUrl} onClick={() => void openSource(source)}>Abrir</Button><KeyboardMenu className="source-menu" label={`Ações de ${source.name || source.domain}`}><button onClick={() => { setEditingSource(source); setDialog('source') }}>Editar</button>{!source.isPreferred && source.status !== 'archived' && <button onClick={() => void sourceAction(() => window.lumi.sources.setPreferred({ sourceId: source.id }), 'Fonte definida como preferida.', reload, showToast)}>Definir como preferida</button>}{source.status === 'active' && <button onClick={() => void sourceAction(() => window.lumi.sources.markUnavailable({ sourceId: source.id }), 'Fonte marcada como indisponível.', reload, showToast)}>Marcar como indisponível</button>}{source.status !== 'archived' && <button onClick={() => void sourceAction(() => window.lumi.sources.archive({ sourceId: source.id }), 'Fonte arquivada.', reload, showToast)}>Arquivar</button>}<button className="is-danger" onClick={() => setDeleteSource(source)}>Excluir permanentemente</button></KeyboardMenu></article>)}</div>{details.sources.length === 0 && <p className="inline-empty">Nenhuma fonte cadastrada.</p>}</Section>
      <NoteSection title="Minha nota" value={work.notes ?? ''} placeholder="Escreva suas impressões sobre a obra." onSave={async (value) => { await window.lumi.works.update({ id: work.id, notes: value || null }); reload() }} />
      <Section title="Histórico">{historyError ? <div className="section-error"><p>Não foi possível carregar o histórico.</p><Button onClick={() => void loadHistory()}>Tentar novamente</Button></div> : <HistoryList history={history.slice(0, historyLimit)} onUndo={async (historyId) => { try { await window.lumi.progress.undo({ historyId }); showToast({ kind: 'info', message: 'Alteração desfeita.' }); reload() } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }} />}{history.length > historyLimit && <Button onClick={() => setHistoryLimit((value) => value + 20)}>Mostrar mais</Button>}</Section>
    </div>

    {dialog === 'edit' && <WorkEditorDialog open details={details} onClose={() => setDialog(null)} onSaved={reload} />}
    {dialog === 'progress' && <ProgressDialog open work={work} sources={details.sources} onClose={() => setDialog(null)} onSaved={reload} />}
    {dialog === 'source' && <SourceDialog open work={work} source={editingSource} onClose={() => { setDialog(null); setEditingSource(null) }} onSaved={reload} />}
    {dialog === 'cover' && <CoverDialog open work={work} onClose={() => setDialog(null)} onSaved={reload} />}
    {dialog === 'metadata' && <MetadataRefreshDialog open workId={work.id} onClose={() => setDialog(null)} onSaved={reload} />}
    {relation && <RelationDialog open kind={relation} work={work} onClose={() => setRelation(null)} onSaved={reload} />}
    <ConfirmDialog open={trashOpen} title={`Mover “${work.title}” para a Lixeira?`} description="Seu progresso, histórico, fontes e notas serão preservados." confirmLabel="Mover" danger onClose={() => setTrashOpen(false)} onConfirm={async () => { try { await window.lumi.works.trash({ workId: work.id }); refreshData(); showToast({ kind: 'success', message: `“${work.title}” foi movida para a Lixeira.` }); navigate('/library') } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }} />
    <ConfirmDialog open={deleteSource !== null} title="Excluir esta fonte permanentemente?" description="O histórico de leitura será preservado, mas a fonte deixará de existir na obra." confirmLabel="Excluir" danger onClose={() => setDeleteSource(null)} onConfirm={async () => { if (!deleteSource) return; await sourceAction(() => window.lumi.sources.deletePermanently({ sourceId: deleteSource.id }), 'Fonte excluída.', reload, showToast); setDeleteSource(null) }} />
  </div>
}

function WorkSkeleton() { return <div className="page work-page"><div className="work-skeleton"><div /><div><i /><i /><i /></div></div><div className="work-skeleton__surface" /><div className="work-skeleton__surface work-skeleton__surface--short" /></div> }
function Section({ title, action, onAction, featured = false, children }: { title: string; action?: string; onAction?(): void; featured?: boolean; children: React.ReactNode }) { return <section className={`work-section ${featured ? 'work-section--featured' : ''}`}><div className="work-section__heading"><h2>{title}</h2>{action && <button onClick={onAction}>+ {action}</button>}</div>{children}</section> }
function EmptyInline({ text, action, onClick }: { text: string; action: string; onClick(): void }) { return <div className="inline-empty"><span>{text}</span><button onClick={onClick}>{action}</button></div> }
function ChipList({ items, onRemove, empty, personal = false }: { items: Array<{ id: string; label: string; hint?: string }>; onRemove(id: string): void; empty: string; personal?: boolean }) { if (!items.length) return <p className="inline-empty">{empty}</p>; return <div className={`detail-chips ${personal ? 'detail-chips--personal' : ''}`}>{items.map((item) => <span key={item.id}>{item.label}{item.hint && <small>{item.hint}</small>}<button aria-label={`Remover ${item.label}`} onClick={() => onRemove(item.id)}>×</button></span>)}</div> }
function groupCreators(details: WorkDetails): Array<[string, string]> { const groups = new Map<string, string[]>(); for (const creator of details.creators) groups.set(CREATOR_ROLES[creator.role] ?? creator.role, [...(groups.get(CREATOR_ROLES[creator.role] ?? creator.role) ?? []), creator.name]); return [...groups.entries()].map(([label, names]) => [label, names.join(', ')]) }

function NoteSection({ title, value, placeholder, featured = false, onSave }: { title: string; value: string; placeholder: string; featured?: boolean; onSave(value: string): Promise<void> }) { const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(value); const [busy, setBusy] = useState(false); const { showToast } = useToast(); useEffect(() => setDraft(value), [value]); return <Section featured={featured} title={title} action={editing ? undefined : value ? 'Editar' : 'Adicionar'} onAction={() => setEditing(true)}>{editing ? <div className="note-editor"><textarea autoFocus rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} /><div><Button onClick={() => { setDraft(value); setEditing(false) }}>Cancelar</Button><Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft.trim()); setEditing(false); showToast({ kind: 'success', message: 'Nota salva.' }) } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) } }}>Salvar</Button></div></div> : value ? <p className="personal-note">“{value}”</p> : <p className="inline-empty">{placeholder}</p>}</Section> }

function HistoryList({ history, onUndo }: { history: ReadingHistory[]; onUndo(id: string): void }) { if (!history.length) return <p className="inline-empty">Nenhuma alteração de progresso registrada.</p>; return <ol className="history-list">{history.map((event, index) => <li key={event.id} className={`history-event history-event--${event.eventType}`}><time>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(event.occurredAt))}</time><div><strong>{historyText(event)}</strong>{(event.sourceNameSnapshot || event.sourceDomainSnapshot) && <span>{event.sourceNameSnapshot || event.sourceDomainSnapshot}</span>}{event.note && <p>“{event.note}”</p>}</div>{index === 0 && (event.eventType === 'progress_update' || event.eventType === 'correction') && <button onClick={() => onUndo(event.id)}>Desfazer alteração</button>}</li>)}</ol> }
function historyText(event: ReadingHistory): string { if (event.eventType === 'initial_progress') return `Progresso inicial definido como ${event.newChapter?.label}.`; if (event.eventType === 'undo') return `Alteração desfeita · ${event.oldChapter?.label ?? '—'} → ${event.newChapter?.label ?? '—'}`; return `${event.oldChapter?.label ?? '—'} → ${event.newChapter?.label ?? '—'}` }
async function removeRelation(operation: () => Promise<void>, reload: () => void, showToast: ReturnType<typeof useToast>['showToast']) { try { await operation(); reload(); showToast({ kind: 'info', message: 'Informação removida.' }) } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }
async function sourceAction(operation: () => Promise<unknown>, message: string, reload: () => void, showToast: ReturnType<typeof useToast>['showToast']) { try { await operation(); reload(); showToast({ kind: 'success', message }) } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } }
