import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveShortcut } from '../../src/renderer/src/app/keyboard-shortcuts'

const key = (value: string, overrides: Partial<KeyboardEvent> = {}) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides
})

describe('atalhos do renderer', () => {
  it('mantém um único indicador de foco nos campos compostos de pesquisa', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    expect(css).toMatch(/\.search-field:focus-within\s*\{[^}]*border-color:\s*var\(--accent\)/)
    expect(css).toMatch(/\.search-field input:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/)
    expect(css).toMatch(/\.quick-search__field:focus-within\s*\{[^}]*border-color:\s*var\(--accent\)/)
    expect(css).toMatch(/\.quick-search__field input:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/)
  })

  it('resolve os comandos globais e contextuais esperados', () => {
    expect(resolveShortcut(key('k', { ctrlKey: true }), false)).toBe('quick-search')
    expect(resolveShortcut(key('n', { ctrlKey: true }), false)).toBe('add-work')
    expect(resolveShortcut(key('/'), false)).toBe('context-search')
    expect(resolveShortcut(key('Escape'), false)).toBe('escape')
  })

  it('não captura navegação enquanto o usuário digita', () => {
    expect(resolveShortcut(key('k', { ctrlKey: true }), true)).toBeNull()
    expect(resolveShortcut(key('n', { ctrlKey: true }), true)).toBeNull()
    expect(resolveShortcut(key('/'), true)).toBeNull()
  })

  it('mantém Ctrl+S disponível para o contexto de edição', () => {
    expect(resolveShortcut(key('s', { ctrlKey: true }), true)).toBe('save')
    expect(resolveShortcut(key('s'), true)).toBeNull()
  })
})