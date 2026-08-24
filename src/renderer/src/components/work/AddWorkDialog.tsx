import { useEffect, useRef, useState } from 'react'
import type { Collection, CoverResult, MediaType, MetadataReview, MetadataSearchResult, UrlMetadataAnalysis, UrlMetadataDuplicate, UserStatus } from '@shared/contracts'
import { navigate } from '../../app/navigation'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS, mapDomainError } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { EMPTY_WORK_FORM, WorkForm, splitNames, type WorkFormState } from './WorkForm'
import { useShortcutScope } from '../../app/keyboard-shortcuts'
import { APP_BRAND } from '@shared/constants/app-branding'

type Mode = 'choose' | 'url' | 'urlPreview' | 'search' | 'review' | 'quick' | 'manual'
type SearchState = 'idle' | 'loading' | 'ready' | 'error'
type ImportForm = { title: string; mediaType: MediaType; userStatus: UserStatus; chapter: string; sourceName: string; sourceUrl: string; lastReadNote: string; allowProbable: boolean }
type UrlDraft = { title: string; sourceName: string; sourceUrl: string; description: string; coverUrl: string }

export function isImportReviewDirty(current: ImportForm, initial: ImportForm | null): boolean {
  return initial !== null && JSON.stringify(current) !== JSON.stringify(initial)
}

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
  const [importForm, setImportForm] = useState<ImportForm>({ title: '', mediaType: 'other', userStatus: 'want_to_read', chapter: '', sourceName: '', sourceUrl: '', lastReadNote: '', allowProbable: false })
  const [initialImportForm, setInitialImportForm] = useState<ImportForm | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [urlAnalysis, setUrlAnalysis] = useState<UrlMetadataAnalysis | null>(null)
  const [urlDraft, setUrlDraft] = useState<UrlDraft | null>(null)
  const requestId = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  useEffect(() => { if (open) void window.auri.collections.list().then(setCollections).catch(() => setCollections([])) }, [open])
  useEffect(() => {
    if (!open || mode !== 'search') return
    const trimmed = debouncedQuery.trim()
    if (trimmed.length < 3) { setSearchState('idle'); setResults([]); return }
    const id = ++requestId.current
    setSearchState('loading'); setSearchError('')
    void window.auri.metadata.search({ provider: 'anilist', query: trimmed }).then((items) => {
      if (id !== requestId.current) return
      setResults(items); setSearchState('ready')
    }).catch((error) => {
      if (id !== requestId.current) return
      setSearchError(errorCode(error) === 'METADATA_RATE_LIMITED' ? 'O AniList limitou as consultas. Aguarde um pouco e tente novamente.' : 'A busca online não está disponível agora. Você ainda pode adicionar a obra manualmente.')
      setSearchState('error')
    })
  }, [debouncedQuery, mode, open])

  const quickDirty = mode === 'quick' && (Boolean(quick.title.trim()) || Boolean(quick.chapter.trim()) || quick.status !== 'reading')
  const reviewDirty = mode === 'review' && isImportReviewDirty(importForm, initialImportForm)
  const dirty = quickDirty || (mode === 'manual' && JSON.stringify(manual) !== JSON.stringify(EMPTY_WORK_FORM)) ||
    ((mode === 'url' || mode === 'urlPreview') && Boolean(urlInput.trim())) || reviewDirty
  useEffect(() => { void window.auri.updates.setDirty({ scope: 'add-work', dirty: open && dirty }) }, [dirty, open])
  useEffect(() => () => { void window.auri.updates.setDirty({ scope: 'add-work', dirty: false }) }, [])
  const reset = () => { setMode('choose'); setQuick({ title: '', chapter: '', status: 'reading' }); setManual(EMPTY_WORK_FORM); setQuery(''); setResults([]); setReview(null); setInitialImportForm(null); setUrlInput(''); setUrlError(''); setUrlAnalysis(null); setUrlDraft(null); setConfirmClose(false) }
  const close = () => { reset(); onClose() }
  const requestClose = () => { if (dirty) setConfirmClose(true); else close() }

  async function analyzeUrl() {
    if (!urlInput.trim()) return
    setBusy(true); setUrlError('')
    try {
      const analysis = await window.auri.urlMetadata.analyze({ url: urlInput })
      setUrlAnalysis(analysis)
      setUrlDraft({
        title: analysis.metadata.title ?? '',
        sourceName: analysis.metadata.siteName ?? analysis.metadata.domain,
        sourceUrl: analysis.metadata.finalUrl,
        description: analysis.metadata.description ?? '',
        coverUrl: analysis.metadata.coverUrl ?? ''
      })
      setMode('urlPreview')
    } catch (error) {
      setUrlError(mapDomainError(error))
    } finally { setBusy(false) }
  }

  async function refreshUrlDuplicate(): Promise<UrlMetadataDuplicate | null> {
    if (!urlDraft) return null
    const duplicate = await window.auri.urlMetadata.checkDuplicate({ url: urlDraft.sourceUrl, title: urlDraft.title.trim() || null })
    setUrlAnalysis((current) => current ? { ...current, duplicate } : current)
    return duplicate
  }

  async function continueUrlManually() {
    if (!urlDraft) return
    setBusy(true)
    try {
      if (await refreshUrlDuplicate()) return
      setManual({
        ...EMPTY_WORK_FORM,
        title: urlDraft.title,
        description: urlDraft.description,
        sourceName: urlDraft.sourceName,
        sourceUrl: urlDraft.sourceUrl,
        sourcePreferred: true,
        coverMode: urlDraft.coverUrl ? 'remote' : 'none',
        coverUrl: urlDraft.coverUrl
      })
      setMode('manual')
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function searchUrlOnAniList() {
    if (!urlDraft?.title.trim()) return
    setBusy(true)
    try {
      if (await refreshUrlDuplicate()) return
      setQuery(urlDraft.title)
      setResults([]); setSearchState('idle')
      setMode('search')
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function addUrlAsSource(workId: string) {
    if (!urlDraft) return
    setBusy(true)
    try {
      const source = await window.auri.sources.create({ workId, name: urlDraft.sourceName.trim() || null, seriesUrl: urlDraft.sourceUrl, isPreferred: false })
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${source.domain} foi adicionada como fonte.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${workId}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function selectResult(result: MetadataSearchResult) {
    setBusy(true)
    try {
      const next = await window.auri.metadata.review({ provider: result.provider, externalId: result.externalId })
      setReview(next)
      const nextForm: ImportForm = { title: next.metadata.title, mediaType: next.metadata.mediaType ?? 'other', userStatus: 'want_to_read', chapter: '', sourceName: urlDraft?.sourceName ?? '', sourceUrl: urlDraft?.sourceUrl ?? '', lastReadNote: '', allowProbable: false }
      setImportForm(nextForm)
      setInitialImportForm(nextForm)
      setMode('review')
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function importMetadata() {
    if (!review) return
    setBusy(true)
    try {
      const details = await window.auri.metadata.import({ provider: review.metadata.provider, externalId: review.metadata.externalId, title: importForm.title, mediaType: importForm.mediaType, userStatus: importForm.userStatus, chapter: importForm.chapter.trim() || null, lastReadNote: importForm.lastReadNote.trim() || null, allowProbableDuplicate: importForm.allowProbable, source: importForm.sourceUrl.trim() ? { name: importForm.sourceName.trim() || null, seriesUrl: importForm.sourceUrl.trim(), isPreferred: true } : undefined })
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${details.work.title} foi importada.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${details.work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function submitQuick() {
    if (!quick.title.trim()) return
    setBusy(true)
    try {
      const work = await window.auri.works.create({ title: quick.title, mediaType: 'manhwa', userStatus: quick.status, ...(quick.chapter.trim() ? { chapter: quick.chapter } : {}) })
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${work.title} foi adicionada à biblioteca.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  async function submitManual() {
    if (!manual.title.trim()) return
    setBusy(true)
    try {
      const details = await window.auri.works.createDetailed({
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
      if (manual.coverMode === 'custom') try { await window.auri.assets.selectCover({ workId: details.work.id }) } catch (error) { showToast({ kind: 'warning', message: `A obra foi criada, mas a capa não foi importada: ${mapDomainError(error)}` }) }
      onCreated(); close()
      showToast({ kind: 'success', message: `✓ ${details.work.title} foi adicionada à biblioteca.`, action: { label: 'Abrir obra', onClick: () => navigate(`/work/${details.work.id}`) } })
    } catch (error) { showToast({ kind: 'error', message: mapDomainError(error) }) } finally { setBusy(false) }
  }

  const save = mode === 'quick' ? submitQuick : mode === 'manual' ? submitManual : mode === 'review' ? importMetadata : undefined
  const saveTitle = mode === 'quick' ? quick.title : mode === 'review' ? importForm.title : manual.title
  const reviewCanImport = mode !== 'review' || !review?.duplicate || review.duplicate.kind === 'probable' && importForm.allowProbable
  useShortcutScope({ save: save ? () => void save() : undefined, canSave: open && dirty && !busy && !confirmClose && Boolean(saveTitle.trim()) && reviewCanImport })

  const noResults = mode === 'search' && searchState === 'ready' && results.length === 0
  const retryTitle = () => { setQuery(''); setResults([]); setSearchState('idle'); window.setTimeout(() => searchInputRef.current?.focus(), 0) }
  const footer = mode === 'choose' ? <Button onClick={close}>Cancelar</Button>
    : mode === 'url' ? <><Button onClick={() => setMode('choose')}>Voltar</Button><Button variant="primary" disabled={busy || !urlInput.trim()} onClick={() => void analyzeUrl()}>{busy ? 'Analisando…' : 'Analisar URL'}</Button></>
      : mode === 'urlPreview' ? <Button onClick={() => setMode('url')}>Voltar</Button>
        : mode === 'search' ? <><Button onClick={() => setMode(urlDraft ? 'urlPreview' : 'choose')}>Voltar</Button>{!noResults && <Button onClick={() => urlDraft ? void continueUrlManually() : setMode('manual')}>Adicionar manualmente</Button>}</>
          : mode === 'review' ? <><Button onClick={() => setMode('search')}>Voltar</Button>{!review?.duplicate || review.duplicate.kind === 'probable' ? <Button variant="primary" disabled={busy || !importForm.title.trim() || (review?.duplicate?.kind === 'probable' && !importForm.allowProbable)} onClick={() => void importMetadata()}>{busy ? 'Importando…' : `Importar para o ${APP_BRAND.name}`}</Button> : null}</>
            : <><Button onClick={() => setMode(mode === 'manual' && urlDraft ? 'urlPreview' : 'choose')}>Voltar</Button><Button variant="primary" disabled={busy || !(mode === 'quick' ? quick.title : manual.title).trim()} onClick={() => void (mode === 'quick' ? submitQuick() : submitManual())}>{busy ? 'Adicionando…' : mode === 'quick' ? 'Adicionar' : 'Adicionar obra'}</Button></>

  return <>
    <Dialog open={open} title={mode === 'url' || mode === 'urlPreview' ? 'Adicionar por URL' : mode === 'search' ? 'Buscar metadados' : mode === 'review' ? 'Revisar antes de importar' : `Adicionar ao ${APP_BRAND.name}`} description={mode === 'choose' ? 'Escolha quanto deseja informar agora. Você poderá editar tudo depois.' : undefined} onClose={requestClose} footer={footer}>
      {mode === 'choose' && <div className="add-mode-grid"><button onClick={() => setMode('url')}><strong>Adicionar por URL</strong><span>Cole a página da obra para detectar título, site, descrição e capa.</span></button><button onClick={() => setMode('search')}><strong>Buscar metadados</strong><span>Pesquise no AniList e revise tudo antes de importar.</span></button><button onClick={() => setMode('quick')}><strong>Adicionar rapidamente</strong><span>Título, progresso e status. Leva poucos segundos.</span></button><button onClick={() => setMode('manual')}><strong>Adicionar manualmente</strong><span>Identificação, organização, fonte, notas e capa.</span></button></div>}
      {mode === 'url' && <form className="url-analyze-form" onSubmit={(event) => { event.preventDefault(); void analyzeUrl() }}><label className="field"><span>URL da página da obra</span><input type="url" autoFocus value={urlInput} onChange={(event) => { setUrlInput(event.target.value); setUrlError('') }} placeholder="https://…" /></label><p className="metadata-hint">O {APP_BRAND.name} acessa somente páginas públicas HTTP/HTTPS e não adiciona nada sem sua confirmação.</p>{urlError && <div className="metadata-error" role="alert"><p>{urlError}</p><Button onClick={() => void analyzeUrl()}>Tentar novamente</Button></div>}</form>}
      {mode === 'urlPreview' && urlAnalysis && urlDraft && <UrlMetadataPreview analysis={urlAnalysis} draft={urlDraft} setDraft={(next) => { setUrlDraft(next); if (urlAnalysis.duplicate?.kind === 'work') setUrlAnalysis({ ...urlAnalysis, duplicate: null }) }} busy={busy} onAniList={() => void searchUrlOnAniList()} onManual={() => void continueUrlManually()} onAddSource={(workId) => void addUrlAsSource(workId)} onOpen={(workId) => { close(); navigate(`/work/${workId}`) }} onCancel={close} />}
      {mode === 'search' && <div className="metadata-search"><label className="field"><span>Título da obra</span><input ref={searchInputRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite pelo menos 3 caracteres" /></label><p className="metadata-search-tip"><strong>Não encontrou?</strong> O AniList pode não reconhecer o título em português usado pelo site onde você lê. Tente pesquisar pelo título em inglês, romanizado ou no idioma original.</p>{searchState === 'idle' && <p className="metadata-hint">Os resultados aparecem após uma pequena pausa na digitação.</p>}{searchState === 'loading' && <div className="metadata-skeleton" role="status"><i /><i /><i /></div>}{searchState === 'error' && <div className="metadata-error" role="alert"><p>{searchError}</p><Button onClick={() => { setSearchState('idle'); setQuery(`${query} `) }}>Tentar novamente</Button></div>}{noResults && <NoMetadataResults onRetry={retryTitle} onManual={() => urlDraft ? void continueUrlManually() : setMode('manual')} />}{searchState === 'ready' && results.length > 0 && <div className="metadata-results">{results.map((result) => <button key={`${result.provider}:${result.externalId}`} disabled={busy} onClick={() => void selectResult(result)}><span className="metadata-result__cover">{result.title.charAt(0)}</span><span><strong>{result.title}</strong><small>{[result.originalTitle, result.startDate?.slice(0, 4), result.mediaType ? MEDIA_TYPE_LABELS[result.mediaType] : null].filter(Boolean).join(' · ')}</small></span><b aria-hidden="true">›</b></button>)}</div>}</div>}
      {mode === 'review' && review && <MetadataReviewForm review={review} form={importForm} setForm={setImportForm} onClose={close} onCreated={onCreated} onAddSource={urlDraft ? addUrlAsSource : undefined} />}
      {mode === 'quick' && <form className="quick-work-form" onSubmit={(event) => { event.preventDefault(); void submitQuick() }}><label className="field"><span>Título *</span><input autoFocus value={quick.title} onChange={(event) => setQuick({ ...quick, title: event.target.value })} placeholder="Ex.: Nano Machine" /></label><label className="field"><span>Último capítulo concluído</span><input value={quick.chapter} onChange={(event) => setQuick({ ...quick, chapter: event.target.value })} placeholder="183, 10A ou Prólogo" /></label><label className="field"><span>Status</span><Select label="Status pessoal" value={quick.status} onChange={(status) => setQuick({ ...quick, status: status as UserStatus })} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label></form>}
      {mode === 'manual' && <WorkForm value={manual} onChange={setManual} collections={collections} />}
    </Dialog>
    <Dialog open={confirmClose} title="Você possui alterações não salvas." description={mode === 'manual' || mode === 'review' ? 'Salve agora ou descarte o que foi preenchido.' : 'A análise atual será descartada.'} onClose={() => setConfirmClose(false)} footer={<><Button variant="danger" onClick={close}>Descartar</Button><Button onClick={() => setConfirmClose(false)}>Continuar editando</Button>{mode === 'manual' && <Button variant="primary" disabled={busy || !manual.title.trim()} onClick={() => { setConfirmClose(false); void submitManual() }}>Salvar</Button>}{mode === 'review' && <Button variant="primary" disabled={busy || !importForm.title.trim() || !reviewCanImport} onClick={() => { setConfirmClose(false); void importMetadata() }}>Importar</Button>}</>} />
  </>
}

export function NoMetadataResults({ onRetry, onManual }: { onRetry(): void; onManual(): void }) {
  return <section className="metadata-empty" aria-live="polite"><h3>Nenhum resultado encontrado.</h3><p>O AniList pode ter esta obra cadastrada com outro título.</p><p>Tente pesquisar pelo:</p><ul><li>título em inglês;</li><li>título romanizado;</li><li>título original.</li></ul><p>Você normalmente encontra um desses nomes na página da obra ou pesquisando o título na web.</p><div><Button onClick={onRetry}>Tentar outro título</Button><Button variant="primary" onClick={onManual}>Adicionar manualmente</Button></div></section>
}

function UrlMetadataPreview({ analysis, draft, setDraft, busy, onAniList, onManual, onAddSource, onOpen, onCancel }: {
  analysis: UrlMetadataAnalysis
  draft: UrlDraft
  setDraft(value: UrlDraft): void
  busy: boolean
  onAniList(): void
  onManual(): void
  onAddSource(workId: string): void
  onOpen(workId: string): void
  onCancel(): void
}) {
  const { metadata, duplicate } = analysis
  const partial = !metadata.title && !metadata.description && !metadata.coverUrl
  const debouncedCoverUrl = useDebouncedValue(draft.coverUrl, 420)
  const [coverPreview, setCoverPreview] = useState<CoverResult>({ state: 'placeholder', dataUrl: null, source: 'none', cached: false })
  useEffect(() => {
    let active = true
    if (!debouncedCoverUrl.trim()) { setCoverPreview({ state: 'placeholder', dataUrl: null, source: 'none', cached: false }); return () => { active = false } }
    setCoverPreview({ state: 'placeholder', dataUrl: null, source: 'remote', cached: false })
    void window.auri.covers.preview({ url: debouncedCoverUrl }).then((result) => { if (active) setCoverPreview(result) }).catch(() => { if (active) setCoverPreview({ state: 'error', dataUrl: null, source: 'remote', cached: false }) })
    return () => { active = false }
  }, [debouncedCoverUrl])
  return <div className="url-metadata-preview">
    {duplicate && <div className="duplicate-callout">
      <strong>{duplicate.kind === 'source' ? 'Esta fonte já está cadastrada para esta obra.' : duplicate.work.deletedAt ? 'Esta obra já está na Lixeira.' : 'Esta obra já está na sua biblioteca.'}</strong>
      <p>“{duplicate.work.title}”</p>
      <div className="url-preview-actions">
        {duplicate.kind === 'work' && !duplicate.work.deletedAt && <Button variant="primary" disabled={busy} onClick={() => onAddSource(duplicate.work.id)}>Adicionar como fonte</Button>}
        <Button onClick={() => onOpen(duplicate.work.id)}>Abrir obra</Button>
        <Button onClick={onCancel}>Cancelar</Button>
      </div>
    </div>}
    <div className="url-preview-summary">
      <div className="metadata-summary__cover" aria-busy={Boolean(draft.coverUrl) && coverPreview.state === 'placeholder'}>{coverPreview.dataUrl ? <img src={coverPreview.dataUrl} alt="" /> : draft.title.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'L'}</div>
      <div><span className="page-kicker">{metadata.siteName ?? metadata.domain}</span><h3>{draft.title || 'Título não identificado'}</h3><p>{!draft.coverUrl ? 'Nenhuma capa detectada.' : coverPreview.state === 'ready' ? `Preview processado pelo sistema de capas do ${APP_BRAND.name}.` : coverPreview.state === 'error' ? 'A capa foi detectada, mas o preview não pôde ser carregado.' : 'Preparando preview da capa…'}</p></div>
    </div>
    {partial && <div className="url-partial-callout"><strong>Não foi possível identificar automaticamente esta obra.</strong><p>Você pode completar os dados manualmente; a fonte já ficará preenchida.</p></div>}
    <div className="form-grid">
      <label className="field field--wide"><span>Título detectado</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Complete manualmente se necessário" /></label>
      <label className="field"><span>Nome do site</span><input value={draft.sourceName} onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })} /></label>
      <label className="field"><span>Domínio</span><input value={metadata.domain} readOnly /></label>
      <label className="field field--wide"><span>URL final</span><input value={draft.sourceUrl} readOnly /></label>
      <label className="field field--wide"><span>Descrição detectada</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Nenhuma descrição detectada" /></label>
      <label className="field field--wide"><span>URL da capa</span><input type="url" value={draft.coverUrl} onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })} placeholder="Nenhuma capa detectada" /></label>
    </div>
    <dl className="metadata-facts"><div><dt>Canonical</dt><dd>{metadata.canonicalUrl ?? 'Não informado'}</dd></div><div><dt>URL analisada</dt><dd>{metadata.requestedUrl}</dd></div></dl>
    {!duplicate && <div className="url-preview-actions"><Button variant="primary" disabled={busy || draft.title.trim().length < 3} onClick={onAniList}>Pesquisar no AniList</Button><Button disabled={busy} onClick={onManual}>Continuar com dados detectados</Button></div>}
  </div>
}

function MetadataReviewForm({ review, form, setForm, onClose, onCreated, onAddSource }: { review: MetadataReview; form: ImportForm; setForm(value: ImportForm): void; onClose(): void; onCreated(): void; onAddSource?(workId: string): Promise<void> }) {
  const { metadata, duplicate } = review
  const { showToast } = useToast()
  return <div className="metadata-review">
    {duplicate && <div className={`duplicate-callout duplicate-callout--${duplicate.kind}`}><strong>{duplicate.kind === 'active' ? 'Esta obra já está na Biblioteca.' : duplicate.kind === 'trash' ? 'Esta obra está na Lixeira.' : 'Possível duplicata encontrada.'}</strong><p>“{duplicate.work.title}”</p><div className="url-preview-actions">{onAddSource && duplicate.kind !== 'trash' && <Button variant="primary" onClick={() => void onAddSource(duplicate.work.id)}>Adicionar como fonte</Button>}{duplicate.kind === 'active' && <Button onClick={() => { onClose(); navigate(`/work/${duplicate.work.id}`) }}>Abrir obra</Button>}{duplicate.kind === 'trash' && <Button onClick={async () => { await window.auri.works.restore({ workId: duplicate.work.id }); onCreated(); onClose(); showToast({ kind: 'success', message: 'Obra restaurada.' }); navigate(`/work/${duplicate.work.id}`) }}>Restaurar</Button>}</div>{duplicate.kind === 'probable' && <label className="check-field"><input type="checkbox" checked={form.allowProbable} onChange={(event) => setForm({ ...form, allowProbable: event.target.checked })} /><span>Manter como obra separada</span></label>}</div>}
    <div className="metadata-summary"><div className="metadata-summary__cover">{metadata.title.charAt(0)}</div><div><span className="page-kicker">AniList</span><h3>{metadata.title}</h3><p>{[metadata.originalTitle, metadata.startDate?.slice(0, 4), metadata.publicationStatus ? PUBLICATION_LABELS[metadata.publicationStatus] : null].filter(Boolean).join(' · ')}</p></div></div>
    {metadata.description && <p className="metadata-description">{metadata.description}</p>}
    <div className="form-grid"><label className="field field--wide"><span>Título no {APP_BRAND.name}</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="field"><span>Tipo</span><Select label="Tipo da obra" value={form.mediaType} onChange={(mediaType) => setForm({ ...form, mediaType: mediaType as MediaType })} options={Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => ({ value, label }))} /></label><label className="field"><span>Meu status</span><Select label="Status pessoal" value={form.userStatus} onChange={(userStatus) => setForm({ ...form, userStatus: userStatus as UserStatus })} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label><label className="field"><span>Último capítulo</span><input value={form.chapter} onChange={(event) => setForm({ ...form, chapter: event.target.value })} placeholder="Opcional" /></label><label className="field"><span>Nome da fonte <small>opcional</small></span><input value={form.sourceName} onChange={(event) => setForm({ ...form, sourceName: event.target.value })} /></label><label className="field field--wide"><span>Onde ler <small>opcional</small></span><input type="url" value={form.sourceUrl} onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })} placeholder="https://…" /></label><label className="field field--wide"><span>Onde parei <small>opcional</small></span><textarea rows={2} value={form.lastReadNote} onChange={(event) => setForm({ ...form, lastReadNote: event.target.value })} /></label></div>
    <dl className="metadata-facts"><div><dt>Creators</dt><dd>{metadata.creators.map((item) => item.name).join(', ') || 'Não informado'}</dd></div><div><dt>Gêneros</dt><dd>{metadata.genres.join(', ') || 'Não informado'}</dd></div><div><dt>Títulos alternativos</dt><dd>{metadata.aliases.map((item) => item.name).join(', ') || 'Nenhum'}</dd></div></dl>
  </div>
}

function errorCode(error: unknown): string | undefined { return typeof error === 'object' && error !== null && 'error' in error ? (error as { error?: { code?: string } }).error?.code : undefined }
