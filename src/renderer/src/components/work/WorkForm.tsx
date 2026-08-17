import type { Collection, MediaType, PublicationStatus, UserStatus } from '@shared/contracts'
import { MEDIA_TYPE_LABELS, PUBLICATION_LABELS, STATUS_LABELS } from '../../lib/format'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'

export interface AliasDraft { name: string; kind: string }
export interface CreatorDraft { name: string; role: 'author' | 'artist' | 'story' | 'original_creator' | 'other' }
export interface WorkFormState {
  title: string; mediaType: MediaType; userStatus: UserStatus; publicationStatus: PublicationStatus | ''
  description: string; countryCode: string; startDate: string; endDate: string; chapter: string
  rating: string; favorite: boolean; notes: string; lastReadNote: string
  aliases: AliasDraft[]; creators: CreatorDraft[]; genres: string; tags: string[]; collectionIds: string[]
  sourceName: string; sourceUrl: string; sourceLastUrl: string; sourceLanguage: string; sourceGroup: string; sourcePreferred: boolean
  coverMode: 'none' | 'remote' | 'custom'; coverUrl: string
}

export const EMPTY_WORK_FORM: WorkFormState = {
  title: '', mediaType: 'manhwa', userStatus: 'reading', publicationStatus: '', description: '', countryCode: '',
  startDate: '', endDate: '', chapter: '', rating: '', favorite: false, notes: '', lastReadNote: '',
  aliases: [], creators: [], genres: '', tags: [], collectionIds: [], sourceName: '', sourceUrl: '', sourceLastUrl: '',
  sourceLanguage: 'pt-BR', sourceGroup: '', sourcePreferred: false, coverMode: 'none', coverUrl: ''
}

const CREATOR_ROLES = { author: 'Autor', artist: 'Artista', story: 'História', original_creator: 'Criador original', other: 'Outro' } as const
const LANGUAGES = { 'pt-BR': 'Português', en: 'Inglês', es: 'Espanhol', ja: 'Japonês', ko: 'Coreano', zh: 'Chinês', other: 'Outro' }

export function splitNames(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean) }

export function WorkForm({ value, onChange, collections = [], includeProgress = true, includeSource = true, includeCover = true }: { value: WorkFormState; onChange(next: WorkFormState): void; collections?: Collection[]; includeProgress?: boolean; includeSource?: boolean; includeCover?: boolean }) {
  const set = <K extends keyof WorkFormState>(key: K, next: WorkFormState[K]) => onChange({ ...value, [key]: next })
  return <div className="work-form">
    <section className="form-section"><div className="form-section__heading"><span>01</span><div><h3>Informações básicas</h3><p>Somente o título é obrigatório.</p></div></div><div className="form-grid">
      <label className="field field--wide"><span>Título *</span><input autoFocus value={value.title} onChange={(event) => set('title', event.target.value)} placeholder="Ex.: Nano Machine" /></label>
      <label className="field"><span>Tipo</span><Select label="Tipo da obra" value={value.mediaType} onChange={(next) => set('mediaType', next as MediaType)} options={Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => ({ value, label }))} /></label>
      <label className="field"><span>Meu status</span><Select label="Status pessoal" value={value.userStatus} onChange={(next) => set('userStatus', next as UserStatus)} options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></label>
      {includeProgress && <label className="field"><span>Último capítulo concluído</span><input value={value.chapter} onChange={(event) => set('chapter', event.target.value)} placeholder="183, 10A ou Prólogo" /></label>}
      <label className="field"><span>Nota pessoal (0–10)</span><input type="number" min="0" max="10" step="0.5" value={value.rating} onChange={(event) => set('rating', event.target.value)} /></label>
      <label className="check-field field--wide"><input type="checkbox" checked={value.favorite} onChange={(event) => set('favorite', event.target.checked)} /><span>Marcar como favorita</span></label>
    </div></section>

    <section className="form-section"><div className="form-section__heading"><span>02</span><div><h3>Identificação</h3><p>Títulos alternativos e pessoas envolvidas.</p></div></div>
      <EditableRows items={value.aliases} emptyLabel="Nenhum título alternativo." addLabel="Adicionar título" onAdd={() => set('aliases', [...value.aliases, { name: '', kind: 'alternative' }])} onRemove={(index) => set('aliases', value.aliases.filter((_, item) => item !== index))}>{(alias, index) => <><input aria-label="Título alternativo" value={alias.name} onChange={(event) => set('aliases', value.aliases.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Título alternativo" /><Select label="Tipo do título" value={alias.kind} onChange={(kind) => set('aliases', value.aliases.map((item, itemIndex) => itemIndex === index ? { ...item, kind } : item))} options={[{ value: 'alternative', label: 'Alternativo' }, { value: 'original', label: 'Original' }, { value: 'localized', label: 'Localizado' }]} /></>}</EditableRows>
      <EditableRows items={value.creators} emptyLabel="Nenhum creator informado." addLabel="Adicionar creator" onAdd={() => set('creators', [...value.creators, { name: '', role: 'author' }])} onRemove={(index) => set('creators', value.creators.filter((_, item) => item !== index))}>{(creator, index) => <><input aria-label="Nome do creator" value={creator.name} onChange={(event) => set('creators', value.creators.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="Nome" /><Select label="Função do creator" value={creator.role} onChange={(role) => set('creators', value.creators.map((item, itemIndex) => itemIndex === index ? { ...item, role: role as CreatorDraft['role'] } : item))} options={Object.entries(CREATOR_ROLES).map(([value, label]) => ({ value, label }))} /></>}</EditableRows>
    </section>

    <section className="form-section"><div className="form-section__heading"><span>03</span><div><h3>Publicação</h3><p>Datas parciais, como apenas o ano, são aceitas.</p></div></div><div className="form-grid">
      <label className="field"><span>Status da publicação</span><Select label="Status da publicação" value={value.publicationStatus} onChange={(next) => set('publicationStatus', next as PublicationStatus | '')} options={[{ value: '', label: 'Não informado' }, ...Object.entries(PUBLICATION_LABELS).filter(([key]) => key !== 'none').map(([value, label]) => ({ value, label }))]} /></label>
      <label className="field"><span>País/origem</span><input value={value.countryCode} onChange={(event) => set('countryCode', event.target.value.toUpperCase())} placeholder="KR, JP, CN…" maxLength={3} /></label>
      <label className="field"><span>Início</span><input value={value.startDate} onChange={(event) => set('startDate', event.target.value)} placeholder="2020 ou 2020-05" /></label>
      <label className="field"><span>Fim</span><input value={value.endDate} onChange={(event) => set('endDate', event.target.value)} placeholder="2024 ou 2024-11" /></label>
      <label className="field field--wide"><span>Descrição</span><textarea rows={5} value={value.description} onChange={(event) => set('description', event.target.value)} placeholder="Sinopse ou contexto da obra…" /></label>
    </div></section>

    <section className="form-section"><div className="form-section__heading"><span>04</span><div><h3>Organização</h3><p>Gêneros são metadados; tags e coleções são pessoais.</p></div></div><div className="form-grid">
      <label className="field field--wide"><span>Gêneros <small>separados por vírgula</small></span><input value={value.genres} onChange={(event) => set('genres', event.target.value)} placeholder="Ação, Fantasia, Artes Marciais" /></label>
      <TagEditor tags={value.tags} onChange={(tags) => set('tags', tags)} />
      {collections.length > 0 && <fieldset className="field field--wide collection-picker"><legend>Coleções</legend>{collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={value.collectionIds.includes(collection.id)} onChange={(event) => set('collectionIds', event.target.checked ? [...value.collectionIds, collection.id] : value.collectionIds.filter((id) => id !== collection.id))} />{collection.name}</label>)}</fieldset>}
    </div></section>

    <section className="form-section"><div className="form-section__heading"><span>05</span><div><h3>Leitura</h3><p>{includeSource ? 'Uma fonte inicial e suas notas pessoais.' : 'Notas pessoais separadas do histórico de leitura.'}</p></div></div><div className="form-grid">
      {includeSource && <>
      <label className="field"><span>Nome da fonte</span><input value={value.sourceName} onChange={(event) => set('sourceName', event.target.value)} placeholder="Opcional; o domínio será usado" /></label>
      <label className="field"><span>Idioma</span><Select label="Idioma da fonte" value={value.sourceLanguage} onChange={(next) => set('sourceLanguage', next)} options={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} /></label>
      <label className="field field--wide"><span>URL da obra</span><input type="url" value={value.sourceUrl} onChange={(event) => set('sourceUrl', event.target.value)} placeholder="https://scan.example/obra" /></label>
      <label className="field field--wide"><span>Última URL usada</span><input type="url" value={value.sourceLastUrl} onChange={(event) => set('sourceLastUrl', event.target.value)} placeholder="Opcional" /></label>
      <label className="field"><span>Grupo de tradução</span><input value={value.sourceGroup} onChange={(event) => set('sourceGroup', event.target.value)} /></label>
      <label className="check-field"><input type="checkbox" checked={value.sourcePreferred} onChange={(event) => set('sourcePreferred', event.target.checked)} /><span>Definir como preferida</span></label>
      </>}
      <label className="field field--wide"><span>Onde parei</span><textarea rows={3} value={value.lastReadNote} onChange={(event) => set('lastReadNote', event.target.value)} placeholder="Contexto para retomar a leitura…" /></label>
      <label className="field field--wide"><span>Minha nota</span><textarea rows={4} value={value.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Suas impressões gerais…" /></label>
    </div></section>

    {includeCover && <section className="form-section"><div className="form-section__heading"><span>06</span><div><h3>Capa</h3><p>Capas remotas ficam salvas como URL; arquivos são copiados pelo Lumi.</p></div></div><div className="cover-options">
      {(['none', 'remote', 'custom'] as const).map((mode) => <label key={mode} className={value.coverMode === mode ? 'is-selected' : ''}><input type="radio" name="cover-mode" checked={value.coverMode === mode} onChange={() => set('coverMode', mode)} /><span>{mode === 'none' ? 'Sem capa' : mode === 'remote' ? 'URL' : 'Arquivo local'}</span></label>)}
      {value.coverMode === 'remote' && <label className="field field--wide"><span>URL da capa</span><input type="url" value={value.coverUrl} onChange={(event) => set('coverUrl', event.target.value)} placeholder="https://…" /></label>}
      {value.coverMode === 'custom' && <p className="form-hint">O seletor seguro de arquivo abrirá depois que a obra for criada.</p>}
    </div></section>}
  </div>
}

function EditableRows<T>({ items, children, emptyLabel, addLabel, onAdd, onRemove }: { items: T[]; children(item: T, index: number): React.ReactNode; emptyLabel: string; addLabel: string; onAdd(): void; onRemove(index: number): void }) {
  return <div className="editable-group">{items.length === 0 && <p>{emptyLabel}</p>}{items.map((item, index) => <div className="editable-row" key={index}>{children(item, index)}<Button variant="ghost" onClick={() => onRemove(index)}>Remover</Button></div>)}<Button icon="plus" onClick={onAdd}>{addLabel}</Button></div>
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange(tags: string[]): void }) {
  const add = (input: HTMLInputElement) => { const value = input.value.trim(); if (!value) return; if (!tags.some((tag) => tag.localeCompare(value, 'pt-BR', { sensitivity: 'base' }) === 0)) onChange([...tags, value]); input.value = '' }
  return <div className="field field--wide"><span>Minhas tags</span><div className="tag-input"><div>{tags.map((tag) => <button key={tag} type="button" onClick={() => onChange(tags.filter((item) => item !== tag))}>{tag} ×</button>)}</div><input placeholder="Digite e pressione Enter" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(event.currentTarget) } }} onBlur={(event) => add(event.currentTarget)} /></div></div>
}
