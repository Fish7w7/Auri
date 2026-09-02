import { describe, expect, it, vi } from 'vitest'
import { blocksAddWorkNavigation, runExclusiveAddWorkPersistence } from '@renderer/lib/add-work-persistence'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('persistência do AddWorkDialog', () => {
  it('bloqueia saída durante save e impede acionamento duplicado', async () => {
    const lock = { current: false }
    const pendingStates: boolean[] = []
    const operation = deferred<string>()
    const save = vi.fn(() => operation.promise)

    const first = runExclusiveAddWorkPersistence(lock, (pending) => pendingStates.push(pending), save)
    expect(lock.current).toBe(true)
    expect(blocksAddWorkNavigation(lock.current)).toBe(true)

    const second = await runExclusiveAddWorkPersistence(lock, (pending) => pendingStates.push(pending), save)
    expect(second).toEqual({ started: false })
    expect(save).toHaveBeenCalledOnce()

    operation.resolve('obra criada')
    expect(await first).toEqual({ started: true, value: 'obra criada' })
    expect(lock.current).toBe(false)
    expect(pendingStates).toEqual([true, false])
  })

  it('mantém busca e análise canceláveis quando não existe persistência', () => {
    expect(blocksAddWorkNavigation(false)).toBe(false)
  })

  it('mantém a proteção até a conclusão da capa personalizada após criar a obra', async () => {
    const lock = { current: false }
    const cover = deferred<void>()
    const create = vi.fn(async () => 'work-1')
    const save = runExclusiveAddWorkPersistence(lock, () => {}, async () => {
      const workId = await create()
      await cover.promise
      return workId
    })
    await Promise.resolve()
    expect(create).toHaveBeenCalledOnce()
    expect(blocksAddWorkNavigation(lock.current)).toBe(true)
    cover.resolve()
    await expect(save).resolves.toEqual({ started: true, value: 'work-1' })
    expect(lock.current).toBe(false)
  })

  it('libera a interação após erro e permite tentar novamente', async () => {
    const lock = { current: false }
    const pendingStates: boolean[] = []
    const failingSave = vi.fn(async () => { throw new Error('falha ao salvar') })

    await expect(runExclusiveAddWorkPersistence(lock, (pending) => pendingStates.push(pending), failingSave)).rejects.toThrow('falha ao salvar')
    expect(lock.current).toBe(false)
    expect(blocksAddWorkNavigation(lock.current)).toBe(false)

    const retry = vi.fn(async () => 'obra criada')
    await expect(runExclusiveAddWorkPersistence(lock, (pending) => pendingStates.push(pending), retry)).resolves.toEqual({ started: true, value: 'obra criada' })
    expect(retry).toHaveBeenCalledOnce()
    expect(pendingStates).toEqual([true, false, true, false])
  })
})
