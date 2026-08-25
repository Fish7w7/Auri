import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Work } from '@shared/contracts'
import { HomeWorkCard } from '@renderer/components/home/HomeWorkCard'
import { WorkCard } from '@renderer/components/work/WorkCard'
import { WorkListRow } from '@renderer/components/work/WorkListRow'
import { stopWorkActionPropagation } from '@renderer/components/work/WorkActions'

const work: Work = {
  id: 'work-actions',
  title: 'Ação imediata',
  normalizedTitle: 'acao imediata',
  mediaType: 'manhwa',
  userStatus: 'reading',
  publicationStatus: 'ongoing',
  description: null,
  countryCode: null,
  startDate: null,
  endDate: null,
  lastReadChapter: { label: '10', number: 10 },
  lastReadAt: null,
  rating: null,
  favorite: false,
  hiddenFromHome: false,
  notes: null,
  lastReadNote: null,
  cover: { type: 'remote', sourceUrl: 'https://example.test/cover.jpg', customPath: null, updatedAt: null },
  metadataUpdatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null
}

const handlers = { onOpen() {}, onFavorite() {}, onIncrement() {}, onTrash() {} }

function expectIndependentActions(html: string, openClass: string) {
  const openStart = html.indexOf(`class="${openClass}"`)
  const openEnd = html.indexOf('</button>', openStart)
  const actionsStart = html.indexOf('class="work-actions"')
  expect(openStart).toBeGreaterThanOrEqual(0)
  expect(actionsStart).toBeGreaterThan(openEnd)
  expect(html).toContain('role="group"')
  expect(html).toContain('aria-label="Adicionar aos favoritos"')
  expect(html).toContain('aria-label="Avançar um capítulo"')
  expect(html).toContain('aria-label="Mover para a Lixeira"')
}

describe('ações rápidas dos cards da Biblioteca', () => {
  it('mantém controles independentes do botão que abre a obra em grade e lista', () => {
    expectIndependentActions(renderToStaticMarkup(createElement(WorkCard, { work, ...handlers })), 'work-card__open')
    expectIndependentActions(renderToStaticMarkup(createElement(WorkListRow, { work, ...handlers })), 'work-list-row__open')
  })

  it('isola pointerdown, mousedown e click na fronteira das ações', () => {
    for (const eventName of ['pointerdown', 'mousedown', 'click']) {
      const stopPropagation = vi.fn()
      stopWorkActionPropagation({ stopPropagation } as never)
      expect(stopPropagation, eventName).toHaveBeenCalledOnce()
    }
  })

  it('mantém o overlay acima da capa e o hover estável em todo o card', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    expect(css).toMatch(/\.work-card \{[^}]*isolation: isolate;/)
    expect(css).toMatch(/\.work-actions \{[^}]*z-index: 4;/)
    expect(css).toContain('.work-card:hover .work-cover, .work-card:focus-within .work-cover')
    expect(css).not.toContain('.work-card__open:hover .work-cover')
    expect(css).toContain('.work-card:hover .work-actions, .work-card:focus-within .work-actions')
  })

  it('mantém Ocultar da Home somente dentro do menu secundário', () => {
    const html = renderToStaticMarkup(createElement(HomeWorkCard, { work, showLastReadNote: false, onOpen() {}, onContinue() {}, onIncrement() {}, onHide() {} }))
    expect(html).toContain('class="home-work-card__actions"')
    expect(html).toContain('class="work-overflow home-work-menu"')
    expect(html).toContain('role="menu"><button>Ocultar da Home</button>')
    expect(html.match(/Ocultar da Home/g)).toHaveLength(1)
  })

  it('fecha menus ao clicar fora e preserva a fronteira contra click-through', () => {
    const source = readFileSync(join(process.cwd(), 'src/renderer/src/components/ui/KeyboardMenu.tsx'), 'utf8')
    expect(source).toContain("document.addEventListener('pointerdown', closeOutside)")
    expect(source).toContain("document.removeEventListener('pointerdown', closeOutside)")
    expect(source).toContain('onPointerDown={(event) => event.stopPropagation()}')
    expect(source).toContain("event.key === 'Escape'")
  })

  it('mantém o menu da Home flutuando acima das ações', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    expect(css).toMatch(/\.work-overflow\.home-work-menu > div \{ top: auto; bottom: calc\(100% \+ 6px\); \}/)
  })

  it('remove as ações no modo de seleção múltipla', () => {
    const html = renderToStaticMarkup(createElement(WorkCard, { work, ...handlers, selectionMode: true, selected: false, onSelect() {} }))
    expect(html).not.toContain('class="work-actions"')
    expect(html).toContain('aria-label="Selecionar Ação imediata"')
  })
})
