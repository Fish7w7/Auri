export type LibraryFocusIntent = 'selection' | 'select-trigger'

interface FocusTarget {
  focus(): void
}

interface FocusRoot {
  querySelector<T extends FocusTarget>(selector: string): T | null
}

const FOCUS_SELECTORS: Record<LibraryFocusIntent, string[]> = {
  selection: [
    '[data-library-selection-focus]:not([disabled])',
    '.bulk-toolbar button:not([disabled])',
    '#library-search',
    '[data-library-filter-trigger]:not([disabled])'
  ],
  'select-trigger': [
    '[data-library-select-trigger]:not([disabled])',
    '#library-search',
    '[data-library-filter-trigger]:not([disabled])'
  ]
}

export function focusLibraryTarget(root: FocusRoot | null, intent: LibraryFocusIntent): string | null {
  if (!root) return null
  for (const selector of FOCUS_SELECTORS[intent]) {
    const target = root.querySelector<FocusTarget>(selector)
    if (!target) continue
    target.focus()
    return selector
  }
  return null
}

export function closeLibraryFilters(
  setOpen: (open: false) => void,
  trigger: FocusTarget | null,
  schedule: (callback: () => void) => void = (callback) => window.requestAnimationFrame(callback)
): void {
  setOpen(false)
  schedule(() => trigger?.focus())
}
