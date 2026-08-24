import { createElement, useMemo, type MouseEvent, type ReactNode } from 'react'
import { parseReleaseNotes, type ReleaseNoteNode } from '../../lib/release-notes'
import { useToast } from '../ui/Toast'

export function ReleaseNotes({ notes }: { notes: string }) {
  const parsed = useMemo(() => parseReleaseNotes(notes), [notes])
  const { showToast } = useToast()
  if (!parsed.length) return null

  const openLink = (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    event.preventDefault()
    void window.auri.shell.openExternal({ url }).catch(() => showToast({ kind: 'error', message: 'Não foi possível abrir este link.' }))
  }

  return <section className="release-notes" aria-labelledby="release-notes-title">
    <h3 id="release-notes-title">Novidades</h3>
    <div className="release-notes__content">{parsed.map((node, index) => renderNode(node, `${index}`, openLink))}</div>
  </section>
}

function renderNode(node: ReleaseNoteNode, key: string, openLink: (event: MouseEvent<HTMLAnchorElement>, url: string) => void): ReactNode {
  if (node.type === 'text') return node.value
  const children = node.children.map((child, index) => renderNode(child, `${key}.${index}`, openLink))
  if (node.tag === 'a') {
    return node.href
      ? <a key={key} href={node.href} onClick={(event) => openLink(event, node.href!)}>{children}</a>
      : <span key={key}>{children}</span>
  }
  return createElement(node.tag, { key }, children)
}
