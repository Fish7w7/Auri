import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { IconName } from '../components/ui/Icon'

export interface QuickSearchAction {
  id: string
  label: string
  keywords: string
  icon: IconName
  path?: string
  command?: 'add-work'
}

export const QUICK_SEARCH_ACTIONS: QuickSearchAction[] = [
  { id: 'add-work', label: 'Adicionar obra', keywords: 'nova criar cadastrar', icon: 'plus', command: 'add-work' },
  { id: 'home', label: 'Home', keywords: 'inicio continuar recentes favoritos', icon: 'home', path: '/' },
  { id: 'library', label: 'Biblioteca', keywords: 'obras livros manga manhwa', icon: 'library', path: '/library' },
  { id: 'collections', label: 'Coleções', keywords: 'grupos organizar', icon: 'layers', path: '/collections' },
  { id: 'settings', label: 'Configurações', keywords: 'preferencias ajustes', icon: 'settings', path: '/settings' },
  { id: 'updates', label: 'Atualizações', keywords: 'update versao baixar', icon: 'rotate', path: '/settings/updates' },
  { id: 'browser-extension', label: 'Extensão do navegador', keywords: 'browser edge chrome brave instalar', icon: 'link', path: '/settings/browser-extension' }
]

export function getQuickSearchActions(query: string): QuickSearchAction[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return QUICK_SEARCH_ACTIONS.slice(0, 5)
  return QUICK_SEARCH_ACTIONS.map((action) => {
    const label = normalizeSearchText(action.label)
    const searchable = `${label} ${normalizeSearchText(action.keywords)}`
    const score = label === normalized ? 0 : label.startsWith(normalized) ? 1 : label.includes(normalized) ? 2 : searchable.includes(normalized) ? 3 : 99
    return { action, score }
  }).filter((item) => item.score < 99).sort((left, right) => left.score - right.score || left.action.label.localeCompare(right.action.label, 'pt-BR')).map((item) => item.action)
}
