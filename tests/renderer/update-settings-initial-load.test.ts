import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateState } from '@shared/contracts'
import {
  InitialUpdateStateFeedback,
  loadInitialUpdateState,
  type InitialUpdateLoad
} from '@renderer/components/settings/UpdatesSettings'

const updateState: UpdateState = {
  status: 'up_to_date', currentVersion: '1.10.0', availableVersion: null,
  progressPercent: null, releaseNotes: null, errorMessage: null,
  lastCheckedAt: null, isDevelopmentMock: false, availability: 'ready'
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function initialLoad(request: () => Promise<UpdateState>) {
  const pending = { current: false }
  let snapshot: InitialUpdateLoad = { status: 'loading' }
  const changes: InitialUpdateLoad[] = []
  const load = () => loadInitialUpdateState(pending, request, (next) => {
    snapshot = next
    changes.push(next)
  })
  return {
    load,
    pending,
    changes,
    snapshot: () => snapshot,
    feedback: () => InitialUpdateStateFeedback({ status: snapshot.status, onRetry: load }),
    html: () => renderToStaticMarkup(createElement(InitialUpdateStateFeedback, { status: snapshot.status, onRetry: load }))
  }
}

describe('carregamento inicial de Atualizações', () => {
  it('passa de loading para o estado normal no primeiro sucesso', async () => {
    const request = vi.fn(async () => updateState)
    const loader = initialLoad(request)

    expect(loader.html()).toContain('role="status"')
    await loader.load()

    expect(request).toHaveBeenCalledOnce()
    expect(loader.changes.map((next) => next.status)).toEqual(['loading', 'ready'])
    expect(loader.snapshot()).toEqual({ status: 'ready', state: updateState })
    expect(loader.html()).toBe('')
  })

  it('encerra loading na rejeição e apresenta alerta com botão real de retry', async () => {
    const loader = initialLoad(vi.fn().mockRejectedValue(new Error('IPC indisponivel')))
    await loader.load()

    expect(loader.pending.current).toBe(false)
    expect(loader.snapshot()).toEqual({ status: 'error' })
    const html = loader.html()
    expect(html).toContain('role="alert"')
    expect(html).toContain('Não foi possível carregar o estado das atualizações.')
    expect(html).toContain('<button type="button"')
    expect(html).toContain('Tentar novamente')
    expect(html).not.toContain('disabled')
    expect(html).not.toContain('Carregando')
  })

  it('faz nova consulta pelo retry, bloqueia duplicatas e remove o erro no sucesso', async () => {
    const recovery = deferred<UpdateState>()
    const request = vi.fn<() => Promise<UpdateState>>()
      .mockRejectedValueOnce(new Error('IPC indisponivel'))
      .mockReturnValueOnce(recovery.promise)
    const loader = initialLoad(request)
    await loader.load()
    const retry = loader.feedback()!.props.onRetry as () => Promise<void>

    const firstClick = retry()
    const secondClick = retry()
    expect(request).toHaveBeenCalledTimes(2)
    expect(loader.pending.current).toBe(true)
    expect(loader.snapshot()).toEqual({ status: 'loading' })
    expect(loader.html()).toContain('role="status"')
    expect(loader.html()).not.toContain('Tentar novamente')

    recovery.resolve(updateState)
    await Promise.all([firstClick, secondClick])
    expect(loader.pending.current).toBe(false)
    expect(loader.snapshot()).toEqual({ status: 'ready', state: updateState })
    expect(loader.html()).toBe('')
  })

  it('mantém uma segunda falha recuperável, sem retry automático', async () => {
    const request = vi.fn<() => Promise<UpdateState>>()
      .mockRejectedValueOnce(new Error('primeira falha'))
      .mockRejectedValueOnce(new Error('segunda falha'))
      .mockResolvedValueOnce(updateState)
    const loader = initialLoad(request)
    await loader.load()
    await loader.load()

    expect(request).toHaveBeenCalledTimes(2)
    expect(loader.snapshot()).toEqual({ status: 'error' })
    expect(loader.pending.current).toBe(false)
    expect(loader.html()).toContain('Tentar novamente')

    await loader.load()
    expect(request).toHaveBeenCalledTimes(3)
    expect(loader.snapshot()).toEqual({ status: 'ready', state: updateState })
  })

  it('não confunde um erro de download retornado pelo updater com falha de IPC', async () => {
    const downloadError: UpdateState = {
      ...updateState, status: 'error', errorContext: 'download',
      availableVersion: '1.11.0', errorMessage: 'Falha no download.'
    }
    const loader = initialLoad(async () => downloadError)
    await loader.load()

    expect(loader.snapshot()).toEqual({ status: 'ready', state: downloadError })
    expect(loader.html()).toBe('')
  })

  it('ignora uma resposta concluída depois da desmontagem', async () => {
    const request = deferred<UpdateState>()
    const pending = { current: false }
    const onChange = vi.fn()
    let active = true
    const result = loadInitialUpdateState(pending, () => request.promise, onChange, () => active)
    active = false
    request.resolve(updateState)
    await result

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ status: 'loading' })
    expect(pending.current).toBe(false)
  })
})
