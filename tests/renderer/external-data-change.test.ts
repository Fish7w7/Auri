import { describe, expect, it, vi } from 'vitest'
import { dispatchDataChanged, subscribeToDataChanges } from '@renderer/app/data-changes'

describe('invalidação de alteração externa', () => {
  it('atualiza Home, Library e Work Detail visíveis uma vez, sem navegação', () => {
    const events = new EventTarget()
    let persistedLabel = 'Sem progresso'
    const home = vi.fn(() => persistedLabel)
    const library = vi.fn(() => persistedLabel)
    const workDetail = vi.fn(() => persistedLabel)
    const removeHome = subscribeToDataChanges(home, undefined, events)
    const removeLibrary = subscribeToDataChanges(library, undefined, events)
    const removeWork = subscribeToDataChanges(workDetail, 'work-id', events)

    persistedLabel = 'Cap. 44'
    dispatchDataChanged({ workId: 'work-id', kind: 'progress' }, events)

    expect(home).toHaveBeenCalledOnce()
    expect(library).toHaveBeenCalledOnce()
    expect(workDetail).toHaveBeenCalledOnce()
    expect(home).toHaveLastReturnedWith('Cap. 44')
    expect(library).toHaveLastReturnedWith('Cap. 44')
    expect(workDetail).toHaveLastReturnedWith('Cap. 44')

    removeHome(); removeLibrary(); removeWork()
    dispatchDataChanged({ workId: 'work-id', kind: 'progress' }, events)
    expect(home).toHaveBeenCalledOnce()
    expect(library).toHaveBeenCalledOnce()
    expect(workDetail).toHaveBeenCalledOnce()
  })

  it('filtra somente Work Detail por workId e não cria ciclo de refresh', () => {
    const events = new EventTarget()
    const home = vi.fn()
    const library = vi.fn()
    const currentWork = vi.fn()
    subscribeToDataChanges(home, undefined, events)
    subscribeToDataChanges(library, undefined, events)
    subscribeToDataChanges(currentWork, 'current-work', events)

    dispatchDataChanged({ workId: 'other-work', kind: 'source' }, events)

    expect(home).toHaveBeenCalledOnce()
    expect(library).toHaveBeenCalledOnce()
    expect(currentWork).not.toHaveBeenCalled()
  })
})
