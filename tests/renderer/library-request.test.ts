import { describe, expect, it, vi } from 'vitest'
import { runLatestLibraryRequest, type LibraryRequestPhase } from '@renderer/lib/latest-library-request'
import {
  armLibraryContextReturn,
  finishWorkNavigation,
  peekLibraryNavigationContext,
  registerWorkNavigation,
  resetNavigationSession
} from '@renderer/app/navigation-session'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('consultas concorrentes da Biblioteca', () => {
  it('ignora rejeição antiga e resposta concluída após desmontagem', async () => {
    const generation = { current: 0 }
    const hasAcceptedResult = { current: false }
    const old = deferred<string[]>()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const onSettled = vi.fn()
    const run = (request: Promise<string[]>) => runLatestLibraryRequest({
      generation, hasAcceptedResult, request: () => request,
      onStart: () => {}, onSuccess, onError, onSettled
    })
    const stale = run(old.promise)
    await run(Promise.resolve(['atual']))
    old.reject(new Error('resposta antiga'))
    expect(await stale).toBe(false)
    expect(onError).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(['atual'])
    expect(onSettled).toHaveBeenCalledOnce()

    const unmounted = deferred<string[]>()
    const pending = run(unmounted.promise)
    generation.current += 1
    unmounted.resolve(['descartado'])
    expect(await pending).toBe(false)
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(onSettled).toHaveBeenCalledOnce()
  })

  it('mantém o resultado da consulta mais recente quando a anterior resolve por último', async () => {
    const generation = { current: 0 }
    const hasAcceptedResult = { current: false }
    const requestA = deferred<string[]>()
    const requestB = deferred<string[]>()
    let works = ['anterior']
    let selectedIds = ['anterior']
    let busy = false
    let settled = 0

    const run = (request: Promise<string[]>) => runLatestLibraryRequest({
      generation,
      hasAcceptedResult,
      request: () => request,
      onStart: () => { busy = true },
      onSuccess: (next) => { works = next; selectedIds = [...next] },
      onError: () => {},
      onSettled: () => { busy = false; settled += 1 }
    })

    const pendingA = run(requestA.promise)
    const pendingB = run(requestB.promise)
    requestB.resolve(['resultado-b'])
    expect(await pendingB).toBe(true)
    expect({ works, selectedIds, busy }).toEqual({ works: ['resultado-b'], selectedIds: ['resultado-b'], busy: false })

    requestA.resolve(['resultado-a'])
    expect(await pendingA).toBe(false)
    expect({ works, selectedIds, busy, settled }).toEqual({ works: ['resultado-b'], selectedIds: ['resultado-b'], busy: false, settled: 1 })
  })

  it('distingue primeiro carregamento de refetch e mantém o resultado anterior enquanto atualiza', async () => {
    const generation = { current: 0 }
    const hasAcceptedResult = { current: false }
    const phases: LibraryRequestPhase[] = []
    let works: string[] = []
    let busy = false

    const run = (request: Promise<string[]>) => runLatestLibraryRequest({
      generation,
      hasAcceptedResult,
      request: () => request,
      onStart: (phase) => { phases.push(phase); busy = true },
      onSuccess: (next) => { works = next },
      onError: () => {},
      onSettled: () => { busy = false }
    })

    await run(Promise.resolve(['primeiro']))
    const refresh = deferred<string[]>()
    const pendingRefresh = run(refresh.promise)
    expect(phases).toEqual(['initial', 'refresh'])
    expect(works).toEqual(['primeiro'])
    expect(busy).toBe(true)

    refresh.resolve(['atualizado'])
    await pendingRefresh
    expect(works).toEqual(['atualizado'])
    expect(busy).toBe(false)
  })

  it('mantém uma consulta restaurada no mesmo fluxo protegido de última requisição', async () => {
    resetNavigationSession()
    registerWorkNavigation('work-1', 'library', {
      path: '/library', search: 'auri', query: { favorite: true, sort: 'title_asc' }, scrollTop: 120
    })
    const target = finishWorkNavigation('work-1')
    armLibraryContextReturn(target.libraryContextId!)
    const restored = peekLibraryNavigationContext('/library')!
    const generation = { current: 0 }
    const hasAcceptedResult = { current: false }
    const older = deferred<string[]>()
    const newer = deferred<string[]>()
    let works: string[] = []
    const seenQueries: unknown[] = []

    const run = (request: Promise<string[]>) => runLatestLibraryRequest({
      generation,
      hasAcceptedResult,
      request: () => { seenQueries.push({ ...restored.query, search: restored.search }); return request },
      onStart: () => {},
      onSuccess: (next) => { works = next },
      onError: () => {},
      onSettled: () => {}
    })

    const pendingOlder = run(older.promise)
    const pendingNewer = run(newer.promise)
    newer.resolve(['novo'])
    await pendingNewer
    older.resolve(['antigo'])
    await pendingOlder

    expect(seenQueries).toEqual([
      { favorite: true, sort: 'title_asc', search: 'auri' },
      { favorite: true, sort: 'title_asc', search: 'auri' }
    ])
    expect(works).toEqual(['novo'])
  })
})
