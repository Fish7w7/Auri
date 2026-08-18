import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react'

export interface ShortcutScope {
  focusSearch?: () => void
  save?: () => void
  canSave?: boolean
  escape?: () => void
}

interface ShortcutRegistry {
  register(scope: RefObject<ShortcutScope>): () => void
}

const ShortcutContext = createContext<ShortcutRegistry | null>(null)

export type ShortcutIntent = 'quick-search' | 'add-work' | 'context-search' | 'save' | 'escape' | null

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[contenteditable="true"]')) return true
  const control = target.closest('input, textarea, select, [role="combobox"]')
  return control !== null
}

export function resolveShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>, typing: boolean): ShortcutIntent {
  const command = event.ctrlKey || event.metaKey
  const key = event.key.toLocaleLowerCase('pt-BR')
  if (command && !event.altKey && key === 's') return 'save'
  if (typing) return null
  if (command && !event.altKey && key === 'k') return 'quick-search'
  if (command && !event.altKey && key === 'n') return 'add-work'
  if (!command && !event.altKey && !event.shiftKey && event.key === '/') return 'context-search'
  if (!command && !event.altKey && event.key === 'Escape') return 'escape'
  return null
}

export function KeyboardShortcutsProvider({ children, onQuickSearch, onAddWork, canAddWork }: {
  children: ReactNode
  onQuickSearch(): void
  onAddWork(): void
  canAddWork: boolean
}) {
  const scopes = useRef<Array<RefObject<ShortcutScope>>>([])
  const actions = useRef({ onQuickSearch, onAddWork, canAddWork })
  actions.current = { onQuickSearch, onAddWork, canAddWork }

  const registry = useRef<ShortcutRegistry>({
    register(scope) {
      scopes.current.push(scope)
      return () => { scopes.current = scopes.current.filter((item) => item !== scope) }
    }
  })

  useEffect(() => {
    const latest = (predicate: (scope: ShortcutScope) => boolean) => {
      for (let index = scopes.current.length - 1; index >= 0; index -= 1) {
        const scope = scopes.current[index].current
        if (scope && predicate(scope)) return scope
      }
      return null
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const intent = resolveShortcut(event, isTypingTarget(event.target))
      if (!intent) return

      if (intent === 'save') {
        const scope = latest((item) => Boolean(item.save && item.canSave))
        if (!scope?.save) return
        event.preventDefault()
        scope.save()
        return
      }

      if (intent === 'quick-search') {
        if (document.querySelector('dialog[open]')) return
        event.preventDefault()
        actions.current.onQuickSearch()
        return
      }

      if (intent === 'add-work') {
        if (!actions.current.canAddWork || document.querySelector('dialog[open]')) return
        event.preventDefault()
        actions.current.onAddWork()
        return
      }

      if (intent === 'context-search') {
        const scope = latest((item) => Boolean(item.focusSearch))
        if (!scope?.focusSearch) return
        event.preventDefault()
        scope.focusSearch()
        return
      }

      const openMenu = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-keyboard-menu][open]')).at(-1)
      if (openMenu) {
        event.preventDefault()
        openMenu.open = false
        openMenu.querySelector<HTMLElement>('summary')?.focus()
        return
      }
      if (document.querySelector('dialog[open]')) return
      const scope = latest((item) => Boolean(item.escape))
      if (!scope?.escape) return
      event.preventDefault()
      scope.escape()
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [])

  return <ShortcutContext.Provider value={registry.current}>{children}</ShortcutContext.Provider>
}

export function useShortcutScope(scope: ShortcutScope): void {
  const registry = useContext(ShortcutContext)
  if (!registry) throw new Error('useShortcutScope precisa estar dentro de KeyboardShortcutsProvider.')
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => registry.register(scopeRef), [registry])
}
