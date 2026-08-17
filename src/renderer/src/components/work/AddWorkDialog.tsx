import { useEffect, useRef, useState } from 'react'
import type { Collection, MediaType, MetadataReview, MetadataSearchResult, UserStatus } from '@shared/contracts'
import { navigate } from '../../app/navigation'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS, mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { EMPTY_WORK_FORM, WorkForm, splitNames, type WorkFormState } from './WorkForm'

type Mode = 'choose' | 'search' | 'review' | 'quick' | 'manual'
type SearchState = 'idle' | 'loading' | 'ready' | 'error'
type ImportForm = { title: string; mediaType: MediaType; userStatus: UserStatus; chapter: string; sourceUrl: string; lastReadNote: string; allowProbable: boolean }

export function AddWorkDialog({ open, onClose, onCreated }: { open: boolean; onClose(): void; onCreated(): void }) {
  const [mode, setMode] = useState<Mode>('choose')
  const [quick, setQuick] = useState({ title: '', chapter: '', status: 'reading' as UserStatus })
  const [manual, setManual] = useState<WorkFormState>(EMPTY_WORK_FORM)
  const [collections, setCollections] = useState<Collection[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 420)
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const [results, setResults] = useState<MetadataSearchResult[]>([])
  const [searchError, setSearchError] = useState('')
  const [review, setReview] = useState<MetadataReview | null>(null)
  const [importForm, setImportForm] = useState<ImportForm>({ title: '', mediaType: 'other', userStatus: 'want_to_read', chapter: '', sourceUrl: '', lastReadNote: '', allowProbable: false })
  const requestId = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  useEffect(() => { if (open) void window.lumi.collections.list().then(setCollections).catch(() => setCollections([])) }, [open])
  useEffect(() => {
    if (!open || mode !== 'search') return
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 3) { setSearchState('idle'); setResults([]); return }
    const id = ++requestId.current
    setSearchState('loading'); setSearchError('')
    void window.lumi.metadata.search({ provider: 'anilist', query: trimmed }).then((items) => {
      if (id !== requestId.current) return
      setResults(items); setSearchState('ready')
    }).catch((error) => {
      if (id !== requestId.current) return
      setSearchError(errorCode(error) === 'METADATA_RATE_LIMITED' ? 'O AniList limitou as consultas. Aguarde um pouco e tente novamente.' : 'A busca online não está disponível agora. Você ainda pode adicionar a obra manualmente.')
      setSearchState('error')
    })
  }, [debouncedQuery, mode, open])

  const dirty = mode === 'manual' && JSON.stringify(manual) !== JSON.stringify(EMPTY_WORK_FORM)
  useEffect(() => { void window.lumi.updates.setDirty({ scope: 'add-work', dirty: open && dirty }) }, [dirty, open])
  useEffect(() => () => { void window.lumi.updates.setDirty({ scope: 'add-work', dirty: false }) }, [])
  const reset = () => { setMode('choose'); setQuick({ title: '', chapter: '', status: 'reading' }); setManual(EMPTY_WORK_FORM); setQuery(''); setResults([]); setReview(null); setConfirmClose(false) }
  const close = () => { reset(); onClose() }
  const requestClose = () => { if (dirty) setConfirmClose(true); else close() }

  async function selectResult(result: MetadataSearchResult) {
    setBusy(true)
    try {
      const next = await window.lumi.metadata.review({ provider: result.provider, externalId: result.externalId })
      setReview(next)
      setImportForm({ title: next.metadata.title, mediaType: next.metadata.mediaType ?? 'other', userStatus: 'want_to_read', chapter: '', sourceUrl: '', lastReadNote: '', allowProbable: false })
      setMode('review')
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function importMetadata() {
    if (!review) return
    setBusy(true)
    try {
      const details = await window.lumi.metadata.import({ provider: review.metadata.provider, externalId: review.metadata.externalId, title: importForm.title, mediaType: importForm.mediaType, userStatus: importForm.userStatus, chapter: importForm.chapter.trim() || null, lastReadNote: importForm.lastReadNote.trim() || null, allowProbableDuplicate: importForm.allowProbable, source: importForm.sourceUrl.trim() ? { seriesUrl: importForm.sourceUrl.trim(), isPreferred: true } : undefined })
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${details.work.title} foi importada.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${details.work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function submitQuick() {
    if (!quick.title.trim()) return
    setBusy(true)
    try {
      const work = await window.lumi.works.create({ title: quick.title, mediaType: 'manhwa', userStatus: quick.status, ...(quick.chapter.trim() ? { chapter: quick.chapter } : {}) })
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${work.title} foi adicionada à biblioteca.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function submitManual() {
    if (!manual.title.trim()) return
    setBusy(true)
    try {
      const details = await window.lumi.works.createDetailed({
        title: manual.title, mediaType: manual.mediaType, userStatus: manual.userStatus,
        publicationStatus: manual.publicationStatus || null, description: manual.description.trim() || null,
        countryCode: manual.countryCode.trim() || null, startDate: manual.startDate.trim() || null,
        endDate: manual.endDate.trim() || null, chapter: manual.chapter.trim() || null,
        rating: manual.rating === '' ? null : Number(manual.rating), favorite: manual.favorite,
        notes: manual.notes.trim() || null, lastReadNote: manual.lastReadNote.trim() || null,
        cover: manual.coverMode === 'remote' && manual.coverUrl.trim() ? { type: 'remote', sourceUrl: manual.coverUrl.trim(), customPath: null } : undefined,
        aliases: manual.aliases.filter((item) => item.name.trim()).map((item) => ({ name: item.name, kind: item.kind, source: 'user' })),
        creators: manual.creators.filter((item) => item.name.trim()).map((item) => ({ ...item, source: 'user' })),
        genres: splitNames(manual.genres), tags: manual.tags, collectionIds: manual.collectionIds,
        source: manual.sourceUrl.trim() || manual.sourceLastUrl.trim() ? { name: manual.sourceName.trim() || null, language: manual.sourceLanguage, seriesUrl: manual.sourceUrl.trim() || null, lastReadUrl: manual.sourceLastUrl.trim() || null, translatorGroup: manual.sourceGroup.trim() || null, isPreferred: manual.sourcePreferred } : undefined
      })
      if (manual.coverMode === 'custom') try { await window.lumi.assets.selectCover({ workId: details.work.id }) } catch (error) { showToast({ kind: 'warning', message: `A obra foi criada, mas a capa não foi importada: ${mapDomainError(error)}` }) }
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${details.work.title} foi adicionada à biblioteca.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${details.work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  const noResults = mode === 'search' && searchState === 'ready' && results.length === 0
  const retryTitle = () => { setQuery(''); setResults([]); setSearchState('idle'); window.setTimeout(() => searchInputRef.current?.focus(), 0) }
  const footer = mode === 'choose' ? <Button onClick={close}>Cancelar</Button> : mode === 'search' ? <><Button onClick={() => setMode('choose')}>Voltar</Button>{!noResults && <Button onClick={() => setMode('manual')}>Adicionar manualmente</Button>}</> : mode === 'review' ? <><Button onClick={() => setMode('search')}>Voltar</Button>{!review?.duplicate || review.duplicate.kind === 'probable' ? <Button variant="primary" disabled={busy || !importForm.title.trim() || (review?.duplicate?.kind === 'probable' && !importForm.allowProbable)} onClick={() => void importMetadata()}>{busy ? 'Importando…' : 'Importar para o Lumi'}</Button> : null}</> : <><Button onClick={() => setMode('choose')}>Voltar</Button><Button variant="primary" disabled={busy || !(mode === 'quick' ? quick.title : manual.title).trim()} onClick={() => void (mode === 'quick' ? submitQuick() : submitManual())}>{busy ? 'Adicionando…' : mode === 'quick' ? 'Adicionar' : 'Adicionar obra'}</Button></>

  return <>
    <Dialog open={open} title={mode === 'search' ? 'Buscar metadados' : mode === 'review' ? 'Revisar antes de importar' : 'Adicionar ao Lumi'} description={mode === 'choose' ? 'Escolha quanto deseja informar agora. Você poderá editar tudo depois.' : undefined} onClose={requestClose} footer={footer}>
      {mode === 'choose' && <div className="add-mode-grid"><button onClick={() => setMode('search')}><strong>Buscar metadados</strong><span>Pesquise no AniList e revise tudo antes de importar.</span></button><button onClick={() => setMode('quick')}><strong>Adicionar rapidamente</strong><span>Título, progresso e status. Leva poucos segundos.</span></button><button onClick={() => setMode('manual')}><strong>Adicionar manualmente</strong><span>Identificação, organização, fonte, notas e capa.</span></button></div>}
      {mode === 'search' && <div className="metadata-search"><label className="field"><span>Título da obra</span><input ref={searchInputRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite pelo menos 3 caracteres" /></label><p className="metadata-search-tip"><strong>Não encontrou?</strong> O AniList pode não reconhecer o título em português usado pelo site onde você lê. Tente pesquisar pelo título em inglês, romanizado ou no idioma original.</p>{searchState === 'idle' && <p className="metadata-hint">Os resultados aparecem após uma pequena pausa na digitação.</p>}{searchState === 'loading' && <div className="metadata-skeleton" role="status"><i /><i /><i /></div>}{searchState === 'error' && <div className="metadata-error" role="alert"><p>{searchError}</p><Button onClick={() => { setSearchState('idle'); setQuery(`${query} `) }}>Tentar novamente</Button></div>}{noResults && <NoMetadataResults onRetry={retryTitle} onManual={() => setMode('manual')} />}{searchState === 'ready' && results.length > 0 && <div className="metadata-results">{results.map((result) => <button key={`${result.provider}:${result.externalId}`} disabled={busy} onClick={() => void selectResult(result)}><span className="metadata-result__cover">{result.title.charAt(0)}</span><span><strong>{result.title}</strong><small>{[result.originalTitle, result.startDate?.slice(0, 4), result.mediaType ? MEDIA_TYPE_LABELS[result.mediaType] : null].filter(Boolean).join(' · ')}</small></span><b aria-hidden="true">›</b></button>)}</div>}</div>}
      {mode === 'review' && review && <MetadataReviewForm review={review} form={importForm} setForm={setImportForm} onClose={close} onCreated={onCreated} />}
      {mode === 'quick' && <form className="quick-work-form" onSubmit={(event) => { event.preventDefault(); void submitQuick() }}><label className="field"><span>Título *</span><input autoFocus value={quick.title} onChange={(event) => setQuick({ ...quick, title: event.target.value })} placeholder="Ex.: Nano Machine" /></label><label className="field"><span>Último capítulo concluído</span><input value={quick.chapter} onChange={(event) => setQuick({ ...quick, chapter: event.target.value })} placeholder="183, 10A ou Prólogo" /></label><label className="field"><span>Status</span><Select label="Status pessoal" value={quick.status} onChange={(status) => setQuick({ ...quick, status: status as UserStatus })} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label></form>}
      {mode === 'manual' && <WorkForm value={manual} onChange={setManual} collections={collections} />}
    </Dialog>
    <Dialog open={confirmClose} title="Você possui alterações não salvas." description="Salve a obra agora ou descarte o que foi preenchido." onClose={() => setConfirmClose(false)} footer={<><Button variant="danger" onClick={close}>Descartar</Button><Button onClick={() => setConfirmClose(false)}>Continuar editando</Button><Button variant="primary" disabled={busy || !manual.title.trim()} onClick={() => { setConfirmClose(false); void submitManual() }}>Salvar</Button></>} />
  </>
}

export function NoMetadataResults({ onRetry, onManual }: { onRetry(): void; onManual(): void }) {
  return <section className="metadata-empty" aria-live="polite"><h3>Nenhum resultado encontrado.</h3><p>O AniList pode ter esta obra cadastrada com outro título.</p><p>Tente pesquisar pelo:</p><ul><li>título em inglês;</li><li>título romanizado;</li><li>título original.</li></ul><p>Você normalmente encontra um desses nomes na página da obra ou pesquisando o título na web.</p><div><Button onClick={onRetry}>Tentar outro título</Button><Button variant="primary" onClick={onManual}>Adicionar manualmente</Button></div></section>
}

function MetadataReviewForm({ review, form, setForm, onClose, onCreated }: { review: MetadataReview; form: ImportForm; setForm(value: ImportForm): void; onClose(): void; onCreated(): void }) {
  const { metadata, duplicate } = review
  const { showToast } = useToast()
  return <div className="metadata-review">
    {duplicate && <div className={`duplicate-callout duplicate-callout--${duplicate.kind}`}><strong>{duplicate.kind === 'active' ? 'Esta obra já está na Biblioteca.' : duplicate.kind === 'trash' ? 'Esta obra está na Lixeira.' : 'Possível duplicata encontrada.'}</strong><p>“{duplicate.work.title}”</p>{duplicate.kind === 'active' && <Button onClick={() => { onClose(); navigate(`/work/${duplicate.work.id}`) }}>Abrir obra</Button>}{duplicate.kind === 'trash' && <Button onClick={async () => { await window.lumi.works.restore({ workId: duplicate.work.id }); onCreated(); onClose(); showToast({ kind: 'success', message: 'Obra restaurada.' }); navigate(`/work/${duplicate.work.id}`) }}>Restaurar</Button>}{duplicate.kind === 'probable' && <label className="check-field"><input type="checkbox" checked={form.allowProbable} onChange={(event) => setForm({ ...form, allowProbable: event.target.checked })} /><span>Manter como obra separada</span></label>}</div>}
    <div className="metadata-summary"><div className="metadata-summary__cover">{metadata.title.charAt(0)}</div><div><span className="page-kicker">AniList</span><h3>{metadata.title}</h3><p>{[metadata.originalTitle, metadata.startDate?.slice(0, 4), metadata.publicationStatus ? PUBLICATION_LABELS[metadata.publicationStatus] : null].filter(Boolean).join(' · ')}</p></div></div>
    {metadata.description && <p className="metadata-description">{metadata.description}</p>}
    <div className="form-grid"><label className="field field--wide"><span>Título no Lumi</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="field"><span>Tipo</span><Select label="Tipo da obra" value={form.mediaType} onChange={(mediaType) => setForm({ ...form, mediaType: mediaType as MediaType })} options={Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => ({ value, label }))} /></label><label className="field"><span>Meu status</span><Select label="Status pessoal" value={form.userStatus} onChange={(userStatus) => setForm({ ...form, userStatus: userStatus as UserStatus })} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label><label className="field"><span>Último capítulo</span><input value={form.chapter} onChange={(event) => setForm({ ...form, chapter: event.target.value })} placeholder="Opcional" /></label><label className="field field--wide"><span>Onde ler <small>opcional</small></span><input type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://…" /></label><label className="field field--wide"><span>Onde parei <small>opcional</small></span><textarea rows={2} value={form.lastReadNote} onChange={(event) => setForm({ ...form, lastReadNote: event.target.value })} /></label></div>
    <dl className="metadata-facts"><div><dt>Creators</dt><dd>{metadata.creators.map((item) => item.name).join(', ') || 'Não informado'}</dd></div><div><dt>Gêneros</dt><dd>{metadata.genres.join(', ') || 'Não informado'}</dd></div><div><dt>Títulos alternativos</dt><dd>{metadata.aliases.map((item) => item.name).join(', ') || 'Nenhum'}</dd></div></dl>
  </div>
}

function errorCode(error: unknown): string | undefined { return typeof error === 'object' && error !== null && 'error' in error ? (error as { error?: { code?: string } }).error?.code : undefined }
