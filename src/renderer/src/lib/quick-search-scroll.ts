interface OptionBounds {
  top: number
  bottom: number
}

function afterClippedOption(position: number, options: readonly OptionBounds[]): number {
  const clipped = options.find((option) => option.top < position && position < option.bottom)
  return clipped ? Math.ceil(clipped.bottom) : position
}

export function getQuickSearchScroll({
  scrollTop, height, contentHeight, options, selectedIndex
}: {
  scrollTop: number
  height: number
  contentHeight: number
  options: readonly OptionBounds[]
  selectedIndex: number
}): { endSpace: number; top: number | null } {
  const naturalEnd = Math.max(0, Math.round(contentHeight) - height)
  const end = afterClippedOption(naturalEnd, options)
  // If the natural end cuts a row, leave only the space needed to clear that row.
  const endSpace = end - naturalEnd
  const selected = options[selectedIndex]
  if (!selected) return { endSpace, top: null }
  if (selectedIndex === 0 && selected.bottom <= height) return { endSpace, top: 0 }
  if (selected.top < scrollTop) return { endSpace, top: Math.floor(selected.top) }

  const needed = Math.max(scrollTop, Math.ceil(selected.bottom - height))
  return { endSpace, top: Math.min(end, afterClippedOption(needed, options)) }
}
