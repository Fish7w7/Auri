import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { IconName } from '../components/ui/Icon'

export type WorkCommand = 'edit' | 'progress' | 'history'

export type QuickSearchAction = {
  id: string
  label: string
  keywords: string
  icon: IconName
  shortcut?: string
} & ({ kind: 'navigate'; path: string } | { kind: 'add' | 'resume' } | { kind: 'work'; command: WorkCommand })

export const QUICK_SEARCH_ACTIONS: QuickSearchAction[] = [
  { id: 'add-work', label: 'Adicionar obra', keywords: 'nova criar cadastrar', icon: 'plus', shortcut: 'Ctrl+N', kind: 'add' },
  { id: 'resume', label: 'Continuar a última leitura', keywords: 'retomar ler fonte capitulo', icon: 'book-open', kind: 'resume' },
  { id: 'edit-work', label: 'Editar obra', keywords: 'alterar titulo dados', icon: 'edit', kind: 'work', command: 'edit' },
  { id: 'progress', label: 'Atualizar progresso', keywords: 'registrar capitulo avancar', icon: 'bookmark', kind: 'work', command: 'progress' },
  { id: 'history', label: 'Histórico de leitura', keywords: 'registros alteracoes desfazer', icon: 'clock', kind: 'work', command: 'history' },
  { id: 'statistics', label: 'Estatísticas', keywords: 'atividade graficos indicadores', icon: 'chart', kind: 'navigate', path: '/statistics' },
  { id: 'home', label: 'Home', keywords: 'inicio recentes favoritos', icon: 'home', kind: 'navigate', path: '/' },
  { id: 'library', label: 'Biblioteca', keywords: 'obras livros manga manhwa pesquisar', icon: 'library', kind: 'navigate', path: '/library' },
  { id: 'collections', label: 'Coleções', keywords: 'grupos organizar', icon: 'layers', kind: 'navigate', path: '/collections' },
  { id: 'settings', label: 'Configurações', keywords: 'preferencias ajustes', icon: 'settings', kind: 'navigate', path: '/settings' },
  { id: 'updates', label: 'Atualizações', keywords: 'update versao baixar', icon: 'rotate', kind: 'navigate', path: '/settings/updates' },
  { id: 'browser-extension', label: 'Extensão do navegador', keywords: 'browser edge chrome brave instalar', icon: 'link', kind: 'navigate', path: '/settings/browser-extension' }
]

export function getQuickSearchActions(query: string, recentIds: readonly string[] = []): QuickSearchAction[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) {
    const ids = [...new Set([...recentIds, ...QUICK_SEARCH_ACTIONS.map((action) => action.id)])]
    return ids.flatMap((id) => QUICK_SEARCH_ACTIONS.filter((action) => action.id === id))
  }
  const terms = normalized.split(' ')
  return QUICK_SEARCH_ACTIONS.map((action) => {
    const label = normalizeSearchText(action.label)
    const searchable = `${label} ${normalizeSearchText(action.keywords)}`
    const score = label === normalized ? 0 : label.startsWith(normalized) ? 1 : terms.every((term) => label.includes(term)) ? 2 : terms.every((term) => searchable.includes(term)) ? 3 : 99
    return { action, score }
  }).filter((item) => item.score < 99).sort((left, right) => left.score - right.score || left.action.label.localeCompare(right.action.label, 'pt-BR')).map((item) => item.action)
}

export function dispatchQuickSearchAction(action: QuickSearchAction, handlers: {
  navigate(path: string): void
  add(): void
  resume(): void
  work(command: WorkCommand): void
}): void {
  if (action.kind === 'navigate') handlers.navigate(action.path)
  else if (action.kind === 'add') handlers.add()
  else if (action.kind === 'resume') handlers.resume()
  else if (action.kind === 'work') handlers.work(action.command)
}
