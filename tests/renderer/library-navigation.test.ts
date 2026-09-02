import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentNavigationPath, navigate, navigateFromWork, navigateToWork } from '@renderer/app/navigation'
import {
  acknowledgeLibraryNavigationContext,
  armLibraryContextReturn,
  finishWorkNavigation,
  getWorkReturnTarget,
  peekLibraryNavigationContext,
  registerWorkNavigation,
  resetNavigationSession
} from '@renderer/app/navigation-session'
import { clampLibraryScrollTop, restoreLibraryScroll } from '@renderer/components/library/VirtualLibrary'

describe('contexto de navegação da Biblioteca', () => {
  beforeEach(() => resetNavigationSession())

  it('restaura pesquisa, filtros, ordenação, caminho e scroll somente no retorno da obra', () => {
    registerWorkNavigation('work-1', 'library', {
      path: '/library/status/reading',
      search: 'nano',
      query: {
        userStatuses: ['reading'],
        mediaTypes: ['manga'],
        publicationStatuses: ['ongoing'],
        favorite: true,
        hasProgress: true,
        sort: 'title_asc'
      },
      scrollTop: 742
    })

    expect(peekLibraryNavigationContext('/library/status/reading')).toBeNull()
    const target = finishWorkNavigation('work-1')
    expect(target).toEqual({ path: '/library/status/reading', label: 'Biblioteca', libraryContextId: 1 })
    armLibraryContextReturn(target.libraryContextId!)

    const restored = peekLibraryNavigationContext(target.path)
    expect(restored).toMatchObject({
      path: '/library/status/reading',
      search: 'nano',
      query: {
        userStatuses: ['reading'],
        mediaTypes: ['manga'],
        publicationStatuses: ['ongoing'],
        favorite: true,
        hasProgress: true,
        sort: 'title_asc'
      },
      scrollTop: 742
    })
    expect(restored).not.toHaveProperty('selection')

    acknowledgeLibraryNavigationContext(restored!.id)
    expect(peekLibraryNavigationContext(target.path)).toBeNull()
  })

  it('mantém Home prioritária e não reutiliza um contexto antigo da Biblioteca', () => {
    registerWorkNavigation('work-library', 'library', {
      path: '/library', search: 'antiga', query: { favorite: true }, scrollTop: 400
    })
    registerWorkNavigation('work-home', 'home')

    expect(getWorkReturnTarget('work-home')).toEqual({ path: '/', label: 'Home' })
    expect(finishWorkNavigation('work-home')).toEqual({ path: '/', label: 'Home' })
    expect(peekLibraryNavigationContext('/library')).toBeNull()
  })

  it('usa a Biblioteca atual como fallback para abertura direta ou origem incompatível', () => {
    registerWorkNavigation('work-direct', 'direct')
    expect(getWorkReturnTarget('work-direct')).toEqual({ path: '/library', label: 'Biblioteca' })
    expect(getWorkReturnTarget('outro-work')).toEqual({ path: '/library', label: 'Biblioteca' })
  })
})

describe('retorno pelas rotas do aplicativo', () => {
  beforeEach(() => {
    resetNavigationSession()
    vi.stubGlobal('window', { location: { hash: '#/library' } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('retorna à coleção com a mesma consulta e não compartilha arrays mutáveis', () => {
    const query = { userStatuses: ['reading' as const], sort: 'chapter_desc' as const }
    navigateToWork('work-1', 'library', { path: '/collections/collection-1', search: 'nano', query, scrollTop: 900 })
    query.userStatuses.splice(0)
    navigateFromWork('work-1')
    expect(currentNavigationPath()).toBe('/collections/collection-1')
    const restored = peekLibraryNavigationContext(currentNavigationPath())!
    expect(restored.query.userStatuses).toEqual(['reading'])
    expect(restored.scrollTop).toBe(900)
    restored.query.userStatuses?.splice(0)
    expect(peekLibraryNavigationContext(currentNavigationPath())?.query.userStatuses).toEqual(['reading'])
  })

  it('descarta o retorno pendente ao fazer uma nova navegação pela sidebar', () => {
    navigateToWork('work-1', 'library', { path: '/library', search: 'nano', query: {}, scrollTop: 900 })
    navigateFromWork('work-1')
    navigate('/library')
    expect(peekLibraryNavigationContext('/library')).toBeNull()
  })

  it('distingue o retorno da Home de uma abertura direta ou externa da mesma obra', () => {
    navigateToWork('work-1', 'home')
    navigateFromWork('work-1')
    expect(currentNavigationPath()).toBe('/')
    navigateToWork('work-1', 'home')
    navigate('/work/work-1')
    expect(getWorkReturnTarget('work-1')).toEqual({ path: '/library', label: 'Biblioteca' })
    navigateFromWork('work-1')
    expect(currentNavigationPath()).toBe('/library')
    expect(peekLibraryNavigationContext('/library')).toBeNull()
  })
})

describe('scroll da Biblioteca', () => {
  it('consome a restauração uma vez, mesmo quando o viewport é recriado', () => {
    const pending = { current: 742 as number | undefined }
    const firstViewport = { scrollTop: 0, scrollHeight: 1600, clientHeight: 600 }
    expect(restoreLibraryScroll(pending, firstViewport)).toBe(742)
    expect(firstViewport.scrollTop).toBe(742)
    const nextViewport = { scrollTop: 0, scrollHeight: 1600, clientHeight: 600 }
    expect(restoreLibraryScroll(pending, nextViewport)).toBeUndefined()
    expect(nextViewport.scrollTop).toBe(0)
  })

  it('não move a lista quando a restauração foi cancelada por interação ou resultado vazio', () => {
    const pending = { current: undefined }
    const viewport = { scrollTop: 150, scrollHeight: 1600, clientHeight: 600 }
    expect(restoreLibraryScroll(pending, viewport)).toBeUndefined()
    expect(viewport.scrollTop).toBe(150)
  })

  it('preserva posições válidas e limita posições que não existem mais', () => {
    expect(clampLibraryScrollTop(480, 1600, 600)).toBe(480)
    expect(clampLibraryScrollTop(1400, 1600, 600)).toBe(1000)
    expect(clampLibraryScrollTop(-20, 1600, 600)).toBe(0)
    expect(clampLibraryScrollTop(200, 400, 600)).toBe(0)
  })
})
