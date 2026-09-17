import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { chooseMenuPlacement, KeyboardMenu, KeyboardMenuCoordinator } from '@renderer/components/ui/KeyboardMenu'
import { OverflowButton } from '@renderer/components/ui/OverflowButton'

describe('KeyboardMenu', () => {
  it('fecha o menu anterior ao abrir outro e limpa somente o menu ativo', () => {
    const coordinator = new KeyboardMenuCoordinator()
    const closeA = vi.fn()
    const closeB = vi.fn()

    coordinator.open('a', closeA)
    coordinator.open('b', closeB)
    expect(closeA).toHaveBeenCalledOnce()
    expect(closeB).not.toHaveBeenCalled()

    coordinator.close('a')
    coordinator.open('c', vi.fn())
    expect(closeB).toHaveBeenCalledOnce()
  })

  it('abre para cima somente quando falta espaço abaixo e há mais espaço acima', () => {
    expect(chooseMenuPlacement(200, 234, 120, 700)).toBe('bottom')
    expect(chooseMenuPlacement(520, 554, 160, 650)).toBe('top')
    expect(chooseMenuPlacement(40, 74, 160, 180)).toBe('bottom')
  })

  it('usa o trigger compartilhado com ícone real, tooltip e nome acessível', () => {
    const html = renderToStaticMarkup(createElement(KeyboardMenu, {
      className: 'example-menu',
      label: 'Mais ações da obra',
      children: createElement('button', null, 'Editar')
    }))

    expect(html).toContain('overflow-button overflow-button--regular')
    expect(html).toContain('aria-label="Mais ações da obra"')
    expect(html).toContain('title="Mais ações da obra"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('•••')
  })

  it('preserva tamanho compacto e estado disabled no componente reutilizável', () => {
    const html = renderToStaticMarkup(createElement(OverflowButton, { size: 'compact', disabled: true }))
    expect(html).toContain('overflow-button--compact')
    expect(html).toContain('aria-label="Mais ações"')
    expect(html).toContain('title="Mais ações"')
    expect(html).toContain('disabled=""')
  })

  it('centraliza outside click, Escape, scroll, portal e fechamento antes da ação', () => {
    const source = readFileSync(join(process.cwd(), 'src/renderer/src/components/ui/KeyboardMenu.tsx'), 'utf8')
    expect(source).toContain("document.addEventListener('pointerdown', closeOutside)")
    expect(source).toContain("document.addEventListener('keydown', closeOnEscape, true)")
    expect(source).toContain("document.addEventListener('scroll', closeOnScroll, true)")
    expect(source).toContain("rootRef.current?.closest('dialog') ?? document.body")
    expect(source).not.toContain('onClickCapture=')
    expect(source).toContain('event.stopPropagation()')
    expect(source).toContain("event.target.closest('button:not(:disabled)')")
    expect(source).toContain("document.removeEventListener('scroll', closeOnScroll, true)")
  })

  it('é reutilizado pelos menus representativos de backups e Fontes', () => {
    const settings = readFileSync(join(process.cwd(), 'src/renderer/src/pages/SettingsPage.tsx'), 'utf8')
    const work = readFileSync(join(process.cwd(), 'src/renderer/src/pages/WorkPage.tsx'), 'utf8')
    expect(settings).toContain('<KeyboardMenu className="backup-item-menu"')
    expect(work).toContain('<KeyboardMenu className="source-menu"')
  })
})
