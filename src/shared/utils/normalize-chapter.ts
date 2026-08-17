export interface NormalizedChapter {
  label: string
  numericValue: number | null
}

const NUMERIC_CHAPTER = /^\d+(?:[.,]\d+)?$/

export function normalizeChapterInput(input: string): { label: string; number: number | null } {
  const normalized = normalizeChapter(input)
  return { label: normalized.label, number: normalized.numericValue }
}

export function normalizeChapter(input: string): NormalizedChapter {
  const trimmed = input.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0) {
    throw new Error('O capítulo não pode estar vazio.')
  }

  if (!NUMERIC_CHAPTER.test(trimmed)) {
    return { label: trimmed, numericValue: null }
  }

  const numericValue = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(numericValue)) {
    throw new Error('O capítulo numérico é inválido.')
  }

  return { label: String(numericValue), numericValue }
}
