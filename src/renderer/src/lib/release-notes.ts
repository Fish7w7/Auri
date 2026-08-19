export const RELEASE_NOTE_TAGS = ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'a', 'br'] as const

export type ReleaseNoteTag = (typeof RELEASE_NOTE_TAGS)[number]
export type ReleaseNoteNode =
  | { type: 'text'; value: string }
  | { type: 'element'; tag: ReleaseNoteTag; href?: string; children: ReleaseNoteNode[] }

const allowedTags = new Set<string>(RELEASE_NOTE_TAGS)
const discardedTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'form'])

export function parseReleaseNotes(value: string): ReleaseNoteNode[] {
  const text = value.trim()
  if (!text) return []
  return /<\/?[a-z][\s\S]*?>/i.test(text) ? parseSafeHtml(text) : parseSimpleMarkdown(text)
}

export function safeReleaseNoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(decodeEntities(value.trim()))
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function parseSafeHtml(html: string): ReleaseNoteNode[] {
  const root: ReleaseNoteNode[] = []
  const stack: Array<{ tag: ReleaseNoteTag; children: ReleaseNoteNode[] }> = []
  const suppressed: string[] = []
  const target = () => stack.at(-1)?.children ?? root
  const tokens = html.match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+|</g) ?? []

  for (const token of tokens) {
    if (!token.startsWith('<')) {
      if (!suppressed.length) appendText(target(), decodeEntities(token))
      continue
    }
    if (token.startsWith('<!--') || token.startsWith('<!')) continue
    const match = token.match(/^<\s*(\/?)\s*([a-zA-Z0-9-]+)([\s\S]*?)>$/)
    if (!match) {
      if (!suppressed.length) appendText(target(), token)
      continue
    }

    const closing = match[1] === '/'
    const rawTag = match[2].toLowerCase()
    const selfClosing = /\/\s*>$/.test(token) || rawTag === 'br'
    if (suppressed.length) {
      if (!closing && discardedTags.has(rawTag) && !selfClosing) suppressed.push(rawTag)
      else if (closing && suppressed.at(-1) === rawTag) suppressed.pop()
      continue
    }
    if (discardedTags.has(rawTag)) {
      if (!closing && !selfClosing) suppressed.push(rawTag)
      continue
    }

    const normalizedTag = rawTag === 'b' ? 'strong' : rawTag === 'i' ? 'em' : rawTag
    if (!allowedTags.has(normalizedTag)) continue
    const tag = normalizedTag as ReleaseNoteTag
    if (closing) {
      const index = stack.map((item) => item.tag).lastIndexOf(tag)
      if (index >= 0) stack.splice(index)
      continue
    }

    const element: Extract<ReleaseNoteNode, { type: 'element' }> = { type: 'element', tag, children: [] }
    if (tag === 'a') element.href = safeReleaseNoteUrl(readHref(match[3]))
    target().push(element)
    if (!selfClosing) stack.push(element)
  }

  return root
}

function parseSimpleMarkdown(markdown: string): ReleaseNoteNode[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const nodes: ReleaseNoteNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/)
    if (heading) {
      nodes.push({ type: 'element', tag: `h${heading[1].length}` as ReleaseNoteTag, children: parseInlineMarkdown(heading[2]) })
      index += 1
      continue
    }
    const list = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/)
    if (list) {
      const tag: ReleaseNoteTag = list[2] ? 'ol' : 'ul'
      const children: ReleaseNoteNode[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/)
        if (!item || (item[2] ? 'ol' : 'ul') !== tag) break
        children.push({ type: 'element', tag: 'li', children: parseInlineMarkdown(item[3]) })
        index += 1
      }
      nodes.push({ type: 'element', tag, children })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !/^\s{0,3}#{1,4}\s+/.test(lines[index]) && !/^\s*(?:[-+*]|\d+\.)\s+/.test(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    nodes.push({ type: 'element', tag: 'p', children: parseInlineMarkdown(paragraph.join(' ')) })
  }

  return nodes
}

function parseInlineMarkdown(text: string): ReleaseNoteNode[] {
  const nodes: ReleaseNoteNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)]\(([^)\s]+)\)|\*([^*]+)\*|_([^_]+)_)/g
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    appendText(nodes, text.slice(offset, start))
    if (match[2] || match[3]) nodes.push({ type: 'element', tag: 'strong', children: [{ type: 'text', value: match[2] ?? match[3] }] })
    else if (match[4]) nodes.push({ type: 'element', tag: 'code', children: [{ type: 'text', value: match[4] }] })
    else if (match[5]) nodes.push({ type: 'element', tag: 'a', href: safeReleaseNoteUrl(match[6]), children: [{ type: 'text', value: match[5] }] })
    else nodes.push({ type: 'element', tag: 'em', children: [{ type: 'text', value: match[7] ?? match[8] }] })
    offset = start + match[0].length
  }
  appendText(nodes, text.slice(offset))
  return nodes
}

function readHref(attributes: string): string | undefined {
  const match = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i)
  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function appendText(nodes: ReleaseNoteNode[], value: string): void {
  if (!value) return
  const previous = nodes.at(-1)
  if (previous?.type === 'text') previous.value += value
  else nodes.push({ type: 'text', value })
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity
    const numeric = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
    return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity
  })
}
