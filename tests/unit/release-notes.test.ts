import { describe, expect, it } from 'vitest'
import { parseReleaseNotes, safeReleaseNoteUrl, type ReleaseNoteNode } from '@renderer/lib/release-notes'

function elements(nodes: ReleaseNoteNode[]): Array<Extract<ReleaseNoteNode, { type: 'element' }>> {
  return nodes.flatMap((node) => node.type === 'element' ? [node, ...elements(node.children)] : [])
}

function text(nodes: ReleaseNoteNode[]): string {
  return nodes.map((node) => node.type === 'text' ? node.value : text(node.children)).join('')
}

describe('release notes seguras', () => {
  it('preserva a estrutura comum do HTML e aceita somente links externos seguros', () => {
    const parsed = parseReleaseNotes('<h1>Lumi v1.1.0</h1><p>Texto <strong>importante</strong> e <em>ênfase</em>.</p><ul><li>Primeiro</li></ul><p><a href="https://example.com/notas">Detalhes</a> <a href="javascript:alert(1)">Perigoso</a></p>')
    const tags = elements(parsed).map((node) => node.tag)
    expect(tags).toEqual(expect.arrayContaining(['h1', 'p', 'strong', 'em', 'ul', 'li', 'a']))
    expect(elements(parsed).filter((node) => node.tag === 'a').map((node) => node.href)).toEqual(['https://example.com/notas', undefined])
  })

  it('descarta conteúdo executável e ignora atributos remotos', () => {
    const parsed = parseReleaseNotes('<h2 style="color:red" onclick="alert(1)">Novidades</h2><script>alert(1)</script><iframe src="https://evil.example">frame</iframe><p><img src=x onerror=alert(1)>Seguro</p>')
    expect(text(parsed)).toBe('NovidadesSeguro')
    expect(elements(parsed).map((node) => node.tag)).toEqual(['h2', 'p'])
  })

  it('apresenta Markdown simples quando as notas não chegam como HTML', () => {
    const parsed = parseReleaseNotes('# Lumi 1.1.0\n\n- Lista\n- **Destaque**\n\nVeja o [site](https://example.com) e use `código`.')
    expect(elements(parsed).map((node) => node.tag)).toEqual(expect.arrayContaining(['h1', 'ul', 'li', 'strong', 'p', 'a', 'code']))
  })

  it('rejeita protocolos que não podem ser abertos externamente', () => {
    expect(safeReleaseNoteUrl('https://example.com')).toBe('https://example.com/')
    expect(safeReleaseNoteUrl('http://example.com')).toBe('http://example.com/')
    expect(safeReleaseNoteUrl('javascript&#58;alert(1)')).toBeUndefined()
    expect(safeReleaseNoteUrl('file:///C:/segredo')).toBeUndefined()
  })
})
