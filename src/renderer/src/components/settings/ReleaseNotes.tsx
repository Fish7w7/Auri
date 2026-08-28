import { createElement, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { parseReleaseNotes, type ReleaseNoteNode } from '../../lib/release-notes'
import { useToast } from '../ui/Toast'

export function ReleaseNotes({ notes }: { notes: string }) {
  const parsed = useMemo(() => parseReleaseNotes(notes), [notes])
  const contentRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const { showToast } = useToast()

  useEffect(() => {
    setExpanded(false)
  }, [notes])

  useEffect(() => {
    if (expanded) return
    const content = contentRef.current
    setCanExpand(Boolean(content && content.scrollHeight > content.clientHeight + 1))
  }, [expanded, notes])

  if (!parsed.length) return null

  const openLink = (event: MouseEvent<HTMLAnchorElement>, url: string) => {
    event.preventDefault()
    void window.auri.shell.openExternal({ url }).catch(() => showToast({ kind: 'error', message: 'Não foi possível abrir este link.' }))
  }

  return <div className="release-notes" aria-label="Novidades da versão">
    <div ref={contentRef} className={`release-notes__content ${expanded ? 'is-expanded' : ''}`}>{parsed.map((node, index) => renderNode(node, String(index), openLink))}</div>
    {canExpand && <button className="release-notes__toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? 'Ocultar notas completas' : 'Ver notas completas'}</button>}
  </div>
}

function renderNode(node: ReleaseNoteNode, key: string, openLink: (event: MouseEvent<HTMLAnchorElement>, url: string) => void): ReactNode {
  if (node.type === 'text') return node.value
  const children = node.children.map((child, index) => renderNode(child, key + '.' + index, openLink))
  if (node.tag === 'a') {
    return node.href
      ? <a key={key} href={node.href} onClick={(event) => openLink(event, node.href!)}>{children}</a>
      : <span key={key}>{children}</span>
  }
  return createElement(node.tag, { key }, children)
}
