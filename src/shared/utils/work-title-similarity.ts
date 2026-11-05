import { normalizeSearchText } from './normalize-search-text'

const STOP_WORDS = new Set('a o as os e de da do das dos em no na nos nas um uma com que me eu para por ao aos seu sua se'.split(' '))

export function workTitleTokens(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(' ').filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))]
}

export function workTitleSimilarity(left: string, right: string): number {
  const a = workTitleTokens(left)
  const b = workTitleTokens(right)
  const shared = a.filter((token) => b.includes(token)).length
  return shared >= 2 ? (2 * shared) / (a.length + b.length) : 0
}
