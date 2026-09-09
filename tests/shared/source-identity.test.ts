import { describe, expect, it } from 'vitest'
import { resolveSourceIdentity } from '@shared/utils/source-identity'

const chapter = (value: string, numericValue: number) => ({
  value,
  numericValue,
  confidence: 'high' as const,
  source: 'url'
})

describe('resolveSourceIdentity', () => {
  it('prefere canonical de série e preserva a página específica', () => {
    expect(resolveSourceIdentity({
      pageUrl: 'https://site.example/series/obra/37',
      canonicalUrl: 'https://site.example/series/obra',
      detectedChapter: chapter('37', 37)
    })).toMatchObject({
      seriesUrl: 'https://site.example/series/obra',
      pageUrl: 'https://site.example/series/obra/37',
      canonicalUrl: 'https://site.example/series/obra'
    })
  })

  it.each([
    ['37', '37', 37],
    ['37.5', '37.5', 37.5],
    ['chapter-37', '37', 37],
    ['chapter_37', '37', 37],
    ['capitulo-37', '37', 37],
    ['cap-37', '37', 37]
  ])('deriva segmento seguro %s quando o capítulo confirma o valor', (segment, value, numericValue) => {
    expect(resolveSourceIdentity({
      pageUrl: `https://site.example/slug/${segment}`,
      canonicalUrl: `https://site.example/slug/${segment}`,
      detectedChapter: chapter(value, numericValue)
    })).toMatchObject({
      seriesUrl: 'https://site.example/slug',
      confidence: 'derived-high-confidence'
    })
  })

  it('deriva sem canonical somente com evidência de alta confiança', () => {
    expect(resolveSourceIdentity({
      pageUrl: 'https://site.example/slug/30/',
      detectedChapter: chapter('30', 30)
    })?.seriesUrl).toBe('https://site.example/slug')
    expect(resolveSourceIdentity({
      pageUrl: 'https://site.example/slug/30',
      detectedChapter: { ...chapter('30', 30), confidence: 'medium' }
    })?.seriesUrl).toBe('https://site.example/slug/30')
  })

  it('ignora canonical contraditório para associação automática', () => {
    const identity = resolveSourceIdentity({
      pageUrl: 'https://site.example/obra-certa/37',
      canonicalUrl: 'https://site.example/outra-obra',
      detectedChapter: chapter('37', 37)
    })
    expect(identity).toMatchObject({
      seriesUrl: 'https://site.example/obra-certa',
      canonicalUrl: null,
      confidence: 'derived-high-confidence'
    })
    expect(identity?.comparisonUrls).not.toContain('https://site.example/outra-obra')
  })

  it('não remove segmento numérico sem evidência de capítulo', () => {
    expect(resolveSourceIdentity({ pageUrl: 'https://site.example/title/12345' })).toMatchObject({
      seriesUrl: 'https://site.example/title/12345',
      confidence: 'exact'
    })
  })

  it('normaliza fragment, trailing slash e ordem da query sem descartar parâmetros', () => {
    const first = resolveSourceIdentity({
      pageUrl: 'https://SITE.example/slug/37/?b=2&a=1#reader',
      detectedChapter: chapter('37', 37)
    })
    const second = resolveSourceIdentity({
      pageUrl: 'https://site.example/slug/37?a=1&b=2',
      detectedChapter: chapter('37', 37)
    })
    expect(first?.seriesUrl).toBe('https://site.example/slug?a=1&b=2')
    expect(first?.seriesUrl).toBe(second?.seriesUrl)
  })
})
