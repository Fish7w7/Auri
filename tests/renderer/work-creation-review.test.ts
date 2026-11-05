import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetadataReview, Source, Work, WorkCreationReview as Review, WorkCreationReviewRequest } from '@shared/contracts'
import { createReviewRequestGuard, refreshRejectedWorkCreation, reviewWorkCreation } from '@renderer/lib/work-creation-review'
import { runExclusiveAddWorkPersistence } from '@renderer/lib/add-work-persistence'
import { WorkCreationReview } from '@renderer/components/work/WorkCreationReview'
import { createExternalDraftForm, createManualWorkRequest, createMetadataWorkRequest } from '@renderer/components/work/AddWorkDialog'
import { EMPTY_WORK_FORM } from '@renderer/components/work/WorkForm'

const { buttons } = vi.hoisted(() => ({ buttons: [] as Array<{ children: string; disabled?: boolean; onClick?(): void }> }))
vi.mock('@renderer/components/ui/Button', async () => {
  const { createElement: element } = await import('react')
  return { Button: (props: { children: string; disabled?: boolean; onClick?(): void }) => { buttons.push(props); return element('button', { disabled: props.disabled, onClick: props.onClick }, props.children) } }
})
const work = { id: '00000000-0000-4000-8000-000000000001', title: 'Me Casei Com o Dragão Que Matei', lastReadChapter: { label: '20', number: 20 }, deletedAt: null, cover: { type: 'none', sourceUrl: null, customPath: null } } as Work
const draft: WorkCreationReviewRequest = { title: 'Me Casei Com o Demônio Que Matei', chapter: '14', mediaType: 'manhwa', userStatus: 'reading' }
const possible: Review = { canKeepSeparate: true, candidates: [{ work, sources: [{ name: 'Scan Sintética', domain: 'reader.example' } as Source], canAddSource: false, identityConflict: false, reasons: ['fuzzy_title'] }] }
const metadata: MetadataReview = { duplicate: null, metadata: { provider: 'anilist', externalId: '42', title: 'Título remoto', originalTitle: null, aliases: [{ name: 'Título alternativo', kind: 'synonym' }], creators: [{ name: 'Autora', role: 'author' }], genres: ['Fantasia'], description: 'Descrição', mediaType: 'manhwa', publicationStatus: 'ongoing', countryCode: 'KR', startDate: '2020', endDate: null, coverUrl: 'https://covers.example/a.jpg', canonicalUrl: 'https://anilist.co/manga/42' } }
beforeEach(() => { buttons.length = 0 })

describe('revisão única de cadastro', () => {
  const flows: Array<[string, WorkCreationReviewRequest]> = [
    ['Quick', draft],
    ['Manual', createManualWorkRequest({ ...EMPTY_WORK_FORM, title: draft.title, chapter: '14' })],
    ['URL', createManualWorkRequest({ ...EMPTY_WORK_FORM, title: draft.title, chapter: '14', sourceUrl: 'https://reader.example/demon/14' })],
    ['AniList', createMetadataWorkRequest(metadata, { title: draft.title, chapter: '14', mediaType: 'manhwa', userStatus: 'reading', sourceName: '', sourceUrl: '', lastReadNote: '', allowProbable: false })],
    ['Extensão', createManualWorkRequest(createExternalDraftForm({ pageUrl: 'https://reader.example/demon/14', title: draft.title, detectedChapter: { value: '14', numericValue: 14, confidence: 'high', source: 'url' } }))]
  ]
  it.each(flows)('%s exige revisão e só salva após manter separada explicitamente', async (_name, input) => {
    const save = vi.fn(async () => 'criada')
    const preview = vi.fn(async () => possible)
    expect(await reviewWorkCreation({ draft: input, preview, save })).toEqual({ kind: 'review', review: possible })
    expect(save).not.toHaveBeenCalled()
    expect(await reviewWorkCreation({ draft: input, preview, save, reviewedWorkIds: [work.id] })).toEqual({ kind: 'saved', value: 'criada' })
    expect(save).toHaveBeenCalledExactlyOnceWith([work.id])
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('Quick sem candidatos continua simples e permite pesquisa manual opcional', async () => {
    const preview = vi.fn(async () => ({ candidates: [], canKeepSeparate: true }))
    const save = vi.fn(async () => 'criada')
    expect(await reviewWorkCreation({ draft, preview, save })).toEqual({ kind: 'saved', value: 'criada' })
    expect(await reviewWorkCreation({ draft, preview, save, forceReview: true })).toMatchObject({ kind: 'review' })
    expect(save).toHaveBeenCalledOnce()
  })

  it('prévia nova forte não aceita confirmação antiga', async () => {
    const strong = { ...possible, canKeepSeparate: false }
    const save = vi.fn()
    expect(await reviewWorkCreation({ draft, preview: async () => strong, save, reviewedWorkIds: [work.id] })).toEqual({ kind: 'review', review: strong })
    expect(save).not.toHaveBeenCalled()
  })

  it('novo candidato ou falha transacional devolve a revisão sem salvar novamente', async () => {
    const second = { ...possible.candidates[0], work: { ...work, id: '00000000-0000-4000-8000-000000000002' } }
    const updated = { ...possible, candidates: [...possible.candidates, second] }
    const save = vi.fn(async () => { throw { error: { code: 'CONFIRMATION_REQUIRED' } } })
    const preview = vi.fn().mockResolvedValueOnce(possible).mockResolvedValueOnce(updated)
    expect(await reviewWorkCreation({ draft, preview, save, reviewedWorkIds: [work.id] })).toMatchObject({ kind: 'review', review: updated, failure: { refreshFailed: false } })
    expect(save).toHaveBeenCalledOnce()
  })

  it('erro na prévia não autoriza persistência e duplo clique mantém uma única operação', async () => {
    const save = vi.fn()
    await expect(reviewWorkCreation({ draft, preview: async () => { throw new Error('IPC indisponível') }, save })).rejects.toThrow('IPC indisponível')
    expect(save).not.toHaveBeenCalled()
    let resolve!: (value: Review) => void
    const pending = new Promise<Review>((done) => { resolve = done })
    const preview = vi.fn(() => pending)
    const lock = { current: false }
    const run = () => runExclusiveAddWorkPersistence(lock, () => {}, () => reviewWorkCreation({ draft, preview, save }))
    const first = run()
    expect(await run()).toEqual({ started: false })
    resolve(possible)
    await first
    expect(preview).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    expect(lock.current).toBe(false)
  })

  it('mostra título, progresso e fonte, abre existente e confirma separação explicitamente', () => {
    const onOpen = vi.fn(), onAddSource = vi.fn(), onKeepSeparate = vi.fn()
    const html = renderToStaticMarkup(createElement(WorkCreationReview, { draft, review: possible, busy: false, onOpen, onAddSource, onKeepSeparate }))
    expect(html).toContain('Esta obra pode já estar na sua biblioteca')
    expect(html).toContain(work.title)
    expect(html).toContain('Cap. 20')
    expect(html).toContain('Scan Sintética')
    expect(html).toContain('Pesquisar na biblioteca')
    expect(html).not.toContain('confidence')
    expect(html).not.toContain('Adicionar como fonte')
    buttons.find((button) => button.children === 'Abrir existente')?.onClick?.()
    buttons.find((button) => button.children === 'Manter separada')?.onClick?.()
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(work.id)
    expect(onKeepSeparate).toHaveBeenCalledExactlyOnceWith([work.id])
    expect(onAddSource).not.toHaveBeenCalled()
  })

  it('oferece fonte somente com permissão forte e bloqueia manter separada', () => {
    const onAddSource = vi.fn()
    const review = { canKeepSeparate: false, candidates: [{ ...possible.candidates[0], canAddSource: true }] }
    const html = renderToStaticMarkup(createElement(WorkCreationReview, { draft, review, busy: false, onOpen() {}, onAddSource, onKeepSeparate() {} }))
    expect(html).toContain('Adicionar como fonte')
    expect(html).not.toContain('Manter separada')
    buttons.find((button) => button.children === 'Adicionar como fonte')?.onClick?.()
    expect(onAddSource).toHaveBeenCalledExactlyOnceWith(work.id)
  })

  it('mantém ações desabilitadas durante processamento e mostra conflito sem vínculo', () => {
    const review = { ...possible, candidates: [{ ...possible.candidates[0], identityConflict: true }] }
    const html = renderToStaticMarkup(createElement(WorkCreationReview, { draft, review, busy: true, onOpen() {}, onAddSource() {}, onKeepSeparate() {} }))
    expect(html).toContain('Os identificadores são diferentes')
    expect(html).not.toContain('Adicionar como fonte')
    expect(buttons.every((button) => button.disabled)).toBe(true)
  })

  it('prévia AniList usa aliases, IDs, creators, capa e fonte que serão importados', () => {
    const input = flows.find(([name]) => name === 'AniList')![1]
    expect(input).toMatchObject({ discoveryTitles: ['Título remoto'], externalRefs: [{ provider: 'anilist', externalId: '42' }], aliases: [{ name: 'Título alternativo', source: 'anilist' }], creators: [{ name: 'Autora', source: 'anilist' }], cover: { type: 'remote', sourceUrl: 'https://covers.example/a.jpg' } })
    const extension = flows.find(([name]) => name === 'Extensão')![1]
    expect(extension).toMatchObject({ chapter: '14', source: { seriesUrl: 'https://reader.example/demon', lastReadUrl: 'https://reader.example/demon/14', isPreferred: false } })
  })
})


describe('rejeição real do bridge e atualização da revisão', () => {
  const strong: Review = { canKeepSeparate: false, candidates: [{ ...possible.candidates[0], canAddSource: true, reasons: ['exact_alias'] }] }
  it('Error sem propriedades personalizadas mantém a rejeição e atualiza ações, sem reenvio', async () => {
    const error = new Error('Esta obra já existe na biblioteca.')
    expect(Object.getOwnPropertyNames(error).sort()).toEqual(['message', 'stack'])
    const preview = vi.fn().mockResolvedValueOnce(possible).mockResolvedValueOnce(strong)
    const save = vi.fn().mockRejectedValue(error)
    const original = structuredClone(draft)
    const result = await reviewWorkCreation({ draft, preview, save, reviewedWorkIds: [work.id] })
    expect(result).toEqual({ kind: 'review', review: strong, failure: { error, refreshFailed: false } })
    expect(save).toHaveBeenCalledOnce()
    expect(preview).toHaveBeenCalledTimes(2)
    expect(draft).toEqual(original)
    if (result.kind !== 'review') throw Error('Rejeição virou sucesso')
    const html = renderToStaticMarkup(createElement(WorkCreationReview, { draft, ...result, busy: false, onOpen() {}, onAddSource() {}, onKeepSeparate() {} }))
    expect(html).toContain('role="alert"')
    expect(html).toContain(error.message)
    expect(html).toContain('A revisão foi atualizada')
    expect(html).toContain('Adicionar como fonte')
    expect(html).not.toContain('Manter separada')
    // Another explicit attempt must use a fresh preview and cannot reuse old permission.
    await reviewWorkCreation({ draft, preview: async () => strong, save, reviewedWorkIds: [work.id] })
    expect(save).toHaveBeenCalledOnce()
  })

  it('refresh indisponível preserva erro original, bloqueia confirmação antiga e permite consultar', async () => {
    const error = new Error('Persistência rejeitada')
    const preview = vi.fn().mockResolvedValueOnce(possible).mockRejectedValueOnce(new Error('IPC indisponível'))
    const save = vi.fn().mockRejectedValue(error)
    const result = await reviewWorkCreation({ draft, preview, save, reviewedWorkIds: [work.id] })
    expect(result).toEqual({ kind: 'review', review: possible, failure: { error, refreshFailed: true } })
    if (result.kind !== 'review') throw Error('Rejeição virou sucesso')
    const onRetry = vi.fn()
    const html = renderToStaticMarkup(createElement(WorkCreationReview, { draft, ...result, busy: false, onRetry, onOpen() {}, onAddSource() {}, onKeepSeparate() {} }))
    expect(html).toContain('Não foi possível verificar a situação atual')
    expect(html).toContain(error.message)
    expect(html).not.toContain('Manter separada')
    expect(html).not.toContain('Adicionar como fonte')
    buttons.find(button => button.children === 'Consultar novamente')?.onClick?.()
    expect(onRetry).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()
    expect(await refreshRejectedWorkCreation(draft, async () => strong, error, possible)).toEqual({ kind: 'review', review: strong, failure: { error, refreshFailed: false } })
  })

  it('qualquer rejeição faz apenas uma nova leitura, mesmo sem candidatos', async () => {
    const empty: Review = { candidates: [], canKeepSeparate: true }
    const error = new Error('Falha de gravação')
    const preview = vi.fn(async () => empty), save = vi.fn().mockRejectedValue(error)
    expect(await reviewWorkCreation({ draft, preview, save })).toEqual({ kind: 'review', review: empty, failure: { error, refreshFailed: false } })
    expect(preview).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenCalledOnce()
  })

  it('descarta respostas fora de ordem e invalida pesquisas quando muda revisão ou modal', async () => {
    const guard = createReviewRequestGuard()
    let first!: (review: Review) => void, second!: (review: Review) => void
    let displayed = possible
    const query = (pending: Promise<Review>) => { const current = guard.start(); return pending.then(value => { if (current()) displayed = value }) }
    const old = query(new Promise(done => { first = done }))
    const recent = query(new Promise(done => { second = done }))
    second(strong); await recent
    first(possible); await old
    expect(displayed).toBe(strong)
    const canceled = query(new Promise(done => { first = done }))
    guard.invalidate() // processing, a new base review, or unmount cancels the old search
    first(possible); await canceled
    expect(displayed).toBe(strong)
  })

  it('mantém lock até refresh terminar, bloqueia duplo clique/saída e libera após rejeição', async () => {
    let finish!: (review: Review) => void
    const preview = vi.fn().mockResolvedValueOnce(possible).mockImplementationOnce(() => new Promise<Review>(done => { finish = done }))
    const save = vi.fn().mockRejectedValue(new Error('Rejeição sem código'))
    const lock = { current: false }, pending = vi.fn()
    const run = () => runExclusiveAddWorkPersistence(lock, pending, () => reviewWorkCreation({ draft, preview, save, reviewedWorkIds: [work.id] }))
    const first = run()
    await vi.waitFor(() => expect(preview).toHaveBeenCalledTimes(2))
    expect(lock.current).toBe(true)
    expect(await run()).toEqual({ started: false })
    finish(strong); await first
    expect(lock.current).toBe(false)
    expect(pending.mock.calls).toEqual([[true], [false]])
    expect(save).toHaveBeenCalledOnce()
  })
})
