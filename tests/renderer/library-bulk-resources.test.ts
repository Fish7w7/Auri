import { describe, expect, it, vi } from 'vitest'
import { isBulkToolbarActionDisabled } from '@renderer/components/library/LibraryBulkActions'
import { createLazyBulkResourceLoader, type LazyBulkResourceSnapshot } from '@renderer/lib/lazy-bulk-resource'

describe('recursos sob demanda das ações em lote', () => {
  it('não carrega ao criar e mantém Status independente dos recursos auxiliares', () => {
    const request = vi.fn(async () => ['tag'])
    const loader = createLazyBulkResourceLoader<string[]>([], request, () => {}, 'Falha')

    expect(request).not.toHaveBeenCalled()
    expect(loader.getSnapshot()).toEqual({ status: 'idle', value: [] })
    expect(isBulkToolbarActionDisabled(1, false)).toBe(false)
  })

  it('carrega cada recurso somente quando solicitado e reutiliza o sucesso', async () => {
    const tagsRequest = vi.fn(async () => ['tag'])
    const collectionsRequest = vi.fn(async () => ['coleção'])
    const tags = createLazyBulkResourceLoader<string[]>([], tagsRequest, () => {}, 'Falha nas tags')
    const collections = createLazyBulkResourceLoader<string[]>([], collectionsRequest, () => {}, 'Falha nas coleções')

    await tags.load()
    expect(tagsRequest).toHaveBeenCalledOnce()
    expect(collectionsRequest).not.toHaveBeenCalled()
    await tags.load()
    expect(tagsRequest).toHaveBeenCalledOnce()

    await collections.load()
    expect(collectionsRequest).toHaveBeenCalledOnce()
    expect(tags.getSnapshot()).toMatchObject({ status: 'ready', value: ['tag'] })
    expect(collections.getSnapshot()).toMatchObject({ status: 'ready', value: ['coleção'] })
  })

  it('isola falhas e permite retry local sem afetar o outro recurso', async () => {
    const tagStates: Array<LazyBulkResourceSnapshot<string[]>> = []
    const collectionStates: Array<LazyBulkResourceSnapshot<string[]>> = []
    const tagsRequest = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(['tag recuperada'])
    const collectionsRequest = vi.fn(async () => ['coleção disponível'])
    const tags = createLazyBulkResourceLoader<string[]>([], tagsRequest, (state) => tagStates.push(state), 'Não foi possível carregar as tags.')
    const collections = createLazyBulkResourceLoader<string[]>([], collectionsRequest, (state) => collectionStates.push(state), 'Não foi possível carregar as coleções.')

    await tags.load()
    expect(tags.getSnapshot()).toMatchObject({ status: 'error', error: 'Não foi possível carregar as tags.' })
    await collections.load()
    expect(collections.getSnapshot()).toMatchObject({ status: 'ready', value: ['coleção disponível'] })

    await tags.load()
    expect(tagsRequest).toHaveBeenCalledTimes(2)
    expect(tags.getSnapshot()).toMatchObject({ status: 'ready', value: ['tag recuperada'] })
    expect(collections.getSnapshot()).toMatchObject({ status: 'ready', value: ['coleção disponível'] })
    expect(tagStates.map((state) => state.status)).toEqual(['loading', 'error', 'loading', 'ready'])
    expect(collectionStates.map((state) => state.status)).toEqual(['loading', 'ready'])
  })
})
