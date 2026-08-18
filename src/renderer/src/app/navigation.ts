import { useEffect, useState } from 'react'
import type { LibrarySort, UserStatus } from '@shared/contracts'

export type AppRoute =
  | { page: 'home' }
  | { page: 'library'; status?: UserStatus; favorite?: boolean; sort?: LibrarySort }
  | { page: 'trash' }
  | { page: 'settings' }
  | { page: 'collections'; id?: string }
  | { page: 'work'; id: string }

export function parseRoute(hash = window.location.hash): AppRoute {
  const path = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (path[0] === 'library') {
    if (path[1] === 'status' && path[2]) return { page: 'library', status: path[2] as UserStatus }
    if (path[1] === 'favorites') return { page: 'library', favorite: true }
    if (path[1] === 'sort' && path[2]) return { page: 'library', sort: path[2] as LibrarySort }
    return { page: 'library' }
  }
  if (path[0] === 'trash') return { page: 'trash' }
  if (path[0] === 'settings') return { page: 'settings' }
  if (path[0] === 'collections') return { page: 'collections', id: path[1] }
  if (path[0] === 'work' && path[1]) return { page: 'work', id: path[1] }
  return { page: 'home' }
}

export function navigate(path: string): void {
  window.location.hash = path
}

export function useRoute(): AppRoute {
  const [route, setRoute] = useState(() => parseRoute())
  useEffect(() => {
    const update = () => setRoute(parseRoute())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}
