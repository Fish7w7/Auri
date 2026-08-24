import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
const windowSetup = readFileSync(join(process.cwd(), 'src/main/windows/create-main-window.ts'), 'utf8')

function token(name: string): string {
  const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  if (!value) throw new Error(`Token ausente ou não hexadecimal: ${name}`)
  return value
}

function luminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? []
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('paleta visual do Auri', () => {
  it('centraliza as cores oficiais e remove os accents roxos antigos da interface', () => {
    expect(token('brand-navy-900')).toBe('#090d15')
    expect(token('brand-navy-700')).toBe('#131b2a')
    expect(token('brand-navy-500')).toBe('#1e2a40')
    expect(token('brand-ivory')).toBe('#f7f0da')
    expect(token('brand-cream')).toBe('#efe1b8')
    expect(token('brand-champagne')).toBe('#d6c08a')
    expect(token('brand-gold')).toBe('#d8b76a')

    for (const legacyPurple of ['#9c83f6', '#ae99f8', '#29223f', '#332a50', '#806dcc']) {
      expect(css.toLowerCase()).not.toContain(legacyPurple)
    }

    expect(windowSetup).toContain("backgroundColor: '#090d15'")
    expect(windowSetup).toContain("color: '#131b2a'")
    expect(windowSetup).toContain("symbolColor: '#f7f0da'")
  })

  it('mantém contraste confortável nos papéis de texto e no CTA principal', () => {
    const background = token('brand-navy-900')
    expect(contrast(token('text-primary'), background)).toBeGreaterThanOrEqual(7)
    expect(contrast(token('text-secondary'), background)).toBeGreaterThanOrEqual(7)
    expect(contrast(token('text-muted'), background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(background, token('brand-champagne'))).toBeGreaterThanOrEqual(7)
  })
})
