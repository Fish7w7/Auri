import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const component = readFileSync(join(process.cwd(), 'src/renderer/src/components/home/HomeCustomizationDialog.tsx'), 'utf8')
const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')

describe('reordenação das seções da Home', () => {
  it('inicia o pointer drag somente pelo handle e persiste a ordem ao soltar', () => {
    expect(component).toMatch(/className="home-customization__handle"[\s\S]*onPointerDown=\{\(event\) => startPointerDrag\(event, row\.id\)\}/)
    expect(component).not.toMatch(/home-customization__row[^>]*onPointerDown/)
    expect(component).toContain("window.addEventListener('pointermove', movePointerDrag")
    expect(component).toContain("window.addEventListener('pointerup', finishPointerDrag)")
    expect(component).toContain('void persistOrder(order)')
  })

  it('remove as setas visíveis e mantém reordenação acessível no próprio handle', () => {
    expect(component).not.toContain('chevron-up')
    expect(component).not.toContain('chevron-down')
    expect(component).toContain('aria-label={`Reordenar ${row.label}`}')
    for (const key of ['Enter', "' '", 'Escape', 'ArrowUp', 'ArrowDown']) expect(component).toContain(key)
    expect(component).toContain('aria-live="polite"')
  })

  it('move uma única row sobre placeholder neutro e sem linha de inserção', () => {
    expect(component).toContain('home-customization__placeholder')
    expect(component).toContain('style={pointerDrag?.id === row.id ? { top: pointerDrag.top, height: pointerDrag.height } : undefined}')
    expect(component).toContain('moveHomeSectionToIndex(current, drag.id, targetIndex)')
    expect(component).toContain('duration: SORT_ANIMATION_MS')
    expect(component).toContain('const SORT_ANIMATION_MS = 150')
    expect(css).toContain('.home-customization__placeholder')
    expect(css).toContain('.home-customization__row.is-dragging { position: absolute;')
    expect(css).not.toContain('is-drop-before')
    expect(css).not.toContain('is-drop-after')
  })

  it('oferece cursores e feedback visual de arraste e foco', () => {
    expect(css).toMatch(/\.home-customization__handle\s*\{[^}]*cursor:\s*grab;/)
    expect(css).toMatch(/\.home-customization__handle:active[^}]*cursor:\s*grabbing;/)
    expect(css).toMatch(/\.home-customization__sections\.is-dragging[^}]*cursor:\s*grabbing;/)
    expect(css).toContain('.home-customization__handle:focus-visible')
    expect(css).toContain('.home-customization__row.is-dragging')
  })
})
