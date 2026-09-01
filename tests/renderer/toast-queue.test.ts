import { describe, expect, it, vi } from 'vitest'
import {
  MAX_TOAST_QUEUE,
  MAX_VISIBLE_TOASTS,
  createToastItem,
  pauseToastDuration,
  runToastActionOnce,
  shouldResumeToastTimer,
  toastReducer,
  type ToastState
} from '@renderer/components/ui/Toast'

const empty = (): ToastState => ({ visible: [], queue: [] })
const enqueue = (state: ToastState, id: string, message: string, dedupeKey?: string): ToastState =>
  toastReducer(state, { type: 'enqueue', item: createToastItem({ message, dedupeKey }, id) })

describe('fila de notificações', () => {
  it('mantém dois toasts visíveis e deixa o terceiro aguardando', () => {
    let state = empty()
    state = enqueue(state, 'a', 'A')
    state = enqueue(state, 'b', 'B')
    state = enqueue(state, 'c', 'C')
    expect(state.visible.map((item) => item.message)).toEqual(['A', 'B'])
    expect(state.queue.map((item) => item.message)).toEqual(['C'])
  })

  it('mantém o toast durante a saída e promove a fila após a remoção definitiva', () => {
    let state = empty()
    for (const [id, message] of [['a', 'A'], ['b', 'B'], ['c', 'C']] as const) state = enqueue(state, id, message)
    state = toastReducer(state, { type: 'start-dismiss', id: 'a' })
    expect(state.visible.map((item) => ({ message: item.message, exiting: item.exiting }))).toEqual([
      { message: 'A', exiting: true },
      { message: 'B', exiting: undefined }
    ])
    expect(state.queue.map((item) => item.message)).toEqual(['C'])

    state = toastReducer(state, { type: 'dismiss', id: 'a' })
    expect(state.visible.map((item) => item.message)).toEqual(['B', 'C'])
    expect(state.queue).toEqual([])
  })

  it('preserva a ação existente durante o estado de saída', () => {
    const undo = vi.fn()
    let state = toastReducer(empty(), {
      type: 'enqueue',
      item: createToastItem({ message: 'Obra ocultada', action: { label: 'Desfazer', onClick: undo } }, 'undo')
    })

    state = toastReducer(state, { type: 'start-dismiss', id: 'undo' })
    expect(state.visible[0]).toMatchObject({ id: 'undo', exiting: true })
    expect(state.visible[0].action?.onClick).toBe(undo)
  })

  it('atualiza o toast semântico de progresso mesmo quando já está visível', () => {
    const undo109 = vi.fn()
    const undo111 = vi.fn()
    let state = toastReducer(empty(), {
      type: 'enqueue',
      item: createToastItem({ kind: 'success', message: 'Progresso atualizado para 109.', dedupeKey: 'progress:work-a', action: { label: 'Desfazer', onClick: undo109 } }, 'progress-a')
    })
    state = enqueue(state, 'other', 'Backup excluído', 'backup-delete')
    state = toastReducer(state, {
      type: 'enqueue',
      item: createToastItem({ kind: 'success', message: 'Progresso atualizado para 111.', dedupeKey: 'progress:work-a', action: { label: 'Desfazer', onClick: undo111 } }, 'progress-a-next')
    })
    expect(state.visible).toHaveLength(MAX_VISIBLE_TOASTS)
    expect(state.queue).toEqual([])
    expect(state.visible[0]).toMatchObject({ id: 'progress-a', message: 'Progresso atualizado para 111.', revision: 1 })
    expect(state.visible[0].action?.onClick).toBe(undo111)
  })

  it('preserva callbacks diferentes para obras ocultadas distintas', async () => {
    const undoA = vi.fn()
    const undoB = vi.fn()
    let state = toastReducer(empty(), { type: 'enqueue', item: createToastItem({ message: 'Obra ocultada da Home', dedupeKey: 'home-hidden-a', action: { label: 'Desfazer', onClick: undoA } }, 'a') })
    state = toastReducer(state, { type: 'enqueue', item: createToastItem({ message: 'Obra ocultada da Home', dedupeKey: 'home-hidden-b', action: { label: 'Desfazer', onClick: undoB } }, 'b') })
    expect(state.visible).toHaveLength(2)
    await state.visible[0].action?.onClick()
    await state.visible[1].action?.onClick()
    expect(undoA).toHaveBeenCalledOnce()
    expect(undoB).toHaveBeenCalledOnce()
  })

  it('deduplica eventos realmente idênticos e renova o timeout lógico', () => {
    let state = enqueue(empty(), 'a', 'Backup excluído', 'backup-delete')
    state = enqueue(state, 'b', 'Backup excluído', 'backup-delete')
    expect(state.visible).toHaveLength(1)
    expect(state.visible[0]).toMatchObject({ id: 'a', revision: 1 })
  })

  it('atualiza progresso no mesmo ID e passa a usar timeout de sucesso', () => {
    let state = toastReducer(empty(), { type: 'enqueue', item: createToastItem({ kind: 'progress', message: 'Criando backup…', dedupeKey: 'backup-create' }, 'backup') })
    expect(state.visible[0]).toMatchObject({ id: 'backup', durationMs: null })
    state = toastReducer(state, { type: 'update', id: 'backup', patch: { kind: 'success', message: 'Backup criado' } })
    expect(state.visible[0]).toMatchObject({ id: 'backup', kind: 'success', message: 'Backup criado', durationMs: 5_000 })
  })

  it('pausa por foco preservando o tempo restante e só retoma ao sair do toast', async () => {
    expect(pauseToastDuration(5_000, 1_000, 2_250)).toBe(3_750)
    const inside = {} as EventTarget
    const outside = {} as EventTarget
    const containsTarget = vi.fn((target: EventTarget) => target === inside)
    expect(shouldResumeToastTimer(containsTarget, inside)).toBe(false)
    expect(shouldResumeToastTimer(containsTarget, outside)).toBe(true)
    expect(shouldResumeToastTimer(containsTarget, null)).toBe(true)

    const locks = new Set<string>()
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const action = vi.fn(() => pending)
    const first = runToastActionOnce('undo', locks, action)
    expect(await runToastActionOnce('undo', locks, action)).toBe(false)
    release()
    expect(await first).toBe(true)
    expect(await runToastActionOnce('undo', locks, action)).toBe(false)
    expect(action).toHaveBeenCalledOnce()
  })

  it('limita a fila curta e sinaliza excesso sem remover erros ou ações silenciosamente', () => {
    let state = enqueue(empty(), 'visible-a', 'Visível A')
    state = enqueue(state, 'visible-b', 'Visível B')
    for (let index = 0; index < MAX_TOAST_QUEUE; index += 1) {
      state = toastReducer(state, { type: 'enqueue', item: createToastItem({ kind: 'error', message: `Erro ${index}` }, `error-${index}`) })
    }
    state = toastReducer(state, { type: 'enqueue', item: createToastItem({ action: { label: 'Desfazer', onClick() {} }, message: 'Ação excedente' }, 'overflow') })
    expect(state.queue).toHaveLength(MAX_TOAST_QUEUE + 1)
    expect(state.queue.filter((item) => item.kind === 'error')).toHaveLength(MAX_TOAST_QUEUE)
    expect(state.queue.at(-1)?.message).toContain('agrupadas')
  })
})
