import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { RendererErrorBoundary } from '../../src/renderer/src/app/RendererErrorBoundary'

describe('RendererErrorBoundary', () => {
  it('troca a tela quebrada por um estado recuperável', () => {
    expect(RendererErrorBoundary.getDerivedStateFromError()).toEqual({ failed: true })
    const boundary = new RendererErrorBoundary({ children: 'conteúdo' })
    boundary.state = { failed: true }
    const fallback = boundary.render() as ReactElement<{ className: string; children: ReactElement[] }>
    expect(fallback.props.className).toBe('renderer-fallback')
    expect(fallback.props.children.at(-1)?.props).toMatchObject({ children: 'Recarregar Auri' })
  })
})
