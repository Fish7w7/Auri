import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ADD_WORK_CHOICES, AddWorkChooser, type AddWorkChooserMode } from '@renderer/components/work/AddWorkDialog'
import { getQuickSearchActions } from '@renderer/lib/quick-search'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type InteractiveProps = {
  children?: ReactNode
  onClick?(): void
  'data-add-work-mode'?: AddWorkChooserMode
}

function interactiveElements(node: ReactNode): ReactElement<InteractiveProps>[] {
  const result: ReactElement<InteractiveProps>[] = []
  Children.forEach(node, (child) => {
    if (!isValidElement<InteractiveProps>(child)) return
    if (child.props.onClick) result.push(child)
    result.push(...interactiveElements(child.props.children))
  })
  return result
}

describe('chooser Adicionar ao Auri', () => {
  it('mantém os quatro fluxos e destaca URL como recomendação', () => {
    expect(ADD_WORK_CHOICES.map((choice) => choice.mode)).toEqual(['url', 'search', 'quick', 'manual'])
    expect(ADD_WORK_CHOICES.filter((choice) => choice.recommended).map((choice) => choice.mode)).toEqual(['url'])

    const html = renderToStaticMarkup(createElement(AddWorkChooser, { onSelect() {}, onCancel() {} }))
    for (const choice of ADD_WORK_CHOICES) {
      expect(html).toContain(`data-add-work-mode="${choice.mode}"`)
      expect(html).toContain(choice.title)
    }
    expect(html).toContain('Recomendado')
    expect(html).toContain('data-dialog-initial-focus="true"')
  })

  it('encaminha cada card ao fluxo correto e mantém Cancelar', () => {
    const onSelect = vi.fn()
    const onCancel = vi.fn()
    const elements = interactiveElements(AddWorkChooser({ onSelect, onCancel }))

    for (const mode of ['url', 'search', 'quick', 'manual'] as const) {
      elements.find((element) => element.props['data-add-work-mode'] === mode)?.props.onClick?.()
    }
    elements.find((element) => element.props.children === 'Cancelar')?.props.onClick?.()

    expect(onSelect.mock.calls.map(([mode]) => mode)).toEqual(['url', 'search', 'quick', 'manual'])
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('usa botões nativos acessíveis e estilos compactos e responsivos', () => {
    const html = renderToStaticMarkup(createElement(AddWorkChooser, { onSelect() {}, onCancel() {} }))
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    expect((html.match(/<button/g) ?? [])).toHaveLength(5)
    expect(html).toContain('type="button"')
    expect(css).toMatch(/\.add-mode-card:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--accent\);[^}]*box-shadow:\s*none;/)
    expect(css).toContain('.add-mode-chooser__secondary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(css).toMatch(/@media \(max-width: 540px\)[\s\S]*\.add-mode-chooser__secondary\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('continua oferecendo o mesmo fluxo pelo Ctrl+K', () => {
    const action = getQuickSearchActions('adicionar obra').find((item) => item.id === 'add-work')
    const appSource = readFileSync(join(process.cwd(), 'src/renderer/src/app/App.tsx'), 'utf8')
    expect(action?.kind).toBe('add')
    expect(appSource).toContain("openAddWork: () => dispatchAddDialog({ type: 'open-manual' })")
  })
})
