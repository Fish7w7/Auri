import { createElement, type ComponentProps, type MouseEvent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Work } from '@shared/contracts'
import { LibraryBulkActions } from '@renderer/components/library/LibraryBulkActions'
import { ToastProvider } from '@renderer/components/ui/Toast'
import type { IconButton } from '@renderer/components/ui/Button'
import { completeLibraryMerge, getSelectedWorksInOrder, shouldShowLibraryAddAction } from '@renderer/pages/LibraryPage'

type IconButtonProps = ComponentProps<typeof IconButton>
const exitControl = vi.hoisted(() => ({ current: undefined as IconButtonProps | undefined }))

vi.mock('@renderer/components/ui/Button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/components/ui/Button')>()
  return {
    ...actual,
    IconButton: (props: IconButtonProps) => {
      if (props.label === 'Sair da seleção') exitControl.current = props
      return actual.IconButton(props)
    }
  }
})

describe('mesclagem rápida pela Biblioteca', () => {
  it.each([1, 3])('%i Work(s) selecionada(s) não disponibiliza merge', (count) => {
    expect(renderToolbar(count)).not.toContain('Mesclar obras')
  })

  it('duas Works selecionadas disponibilizam merge', () => {
    expect(renderToolbar(2)).toContain('Mesclar obras')
  })

  it('oculta Selecionar tudo quando todos os resultados visíveis estão selecionados', () => {
    expect(renderToolbar(2)).not.toContain('Selecionar tudo')
  })

  it('mantém Selecionar tudo disponível enquanto há resultado visível não selecionado', () => {
    expect(renderToolbar(1, 2)).toContain('Selecionar tudo')
  })

  it('oculta a ação de adicionar durante a seleção e a restaura ao sair', () => {
    expect(shouldShowLibraryAddAction(true)).toBe(false)
    expect(shouldShowLibraryAddAction(false)).toBe(true)
  })

  it('expõe um X acessível que encerra o modo de seleção', () => {
    const onExit = vi.fn()
    const html = renderToolbar(1, 1, onExit)

    expect(html).toContain('aria-label="Sair da seleção"')
    expect(html).toContain('title="Sair da seleção"')
    exitControl.current?.onClick?.({} as MouseEvent<HTMLButtonElement>)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('identifica o Select das ações em lote para preservar o cabeçalho do modal', () => {
    expect(renderToolbar(1)).toMatch(/class="auri-select[^"]*bulk-action-select"/)
  })

  it('usa a ordem explícita de seleção para Primary e Secondary', () => {
    const first = work('11111111-1111-4111-8111-111111111111', 'Primeira')
    const second = work('22222222-2222-4222-8222-222222222222', 'Segunda')
    const displayed = [second, first]
    expect(getSelectedWorksInOrder(new Set([first.id, second.id]), displayed)).toEqual([first, second])
  })

  it('cancelamento do modal não altera a seleção', () => {
    const ids = new Set(['a', 'b'])
    const close = vi.fn()
    close()
    expect([...ids]).toEqual(['a', 'b'])
    expect(close).toHaveBeenCalledOnce()
  })

  it('sucesso fecha, sai da seleção, atualiza e notifica sem navegar', () => {
    const actions = { close: vi.fn(), exitSelection: vi.fn(), refresh: vi.fn(), notify: vi.fn() }
    completeLibraryMerge(actions)
    expect(actions.close).toHaveBeenCalledOnce()
    expect(actions.exitSelection).toHaveBeenCalledOnce()
    expect(actions.refresh).toHaveBeenCalledOnce()
    expect(actions.notify).toHaveBeenCalledOnce()
  })
})

function renderToolbar(selectedCount: number, resultCount = selectedCount, onExit = vi.fn()): string {
  exitControl.current = undefined
  const works = Array.from({ length: resultCount }, (_, index) => work(`00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, `Obra ${index + 1}`))
  const selectedWorks = works.slice(0, selectedCount)
  return renderToStaticMarkup(createElement(ToastProvider, null,
    createElement(LibraryBulkActions, {
      selectedIds: new Set(selectedWorks.map((item) => item.id)),
      selectedWorks,
      resultIds: works.map((item) => item.id),
      onSelectAll() {}, onClear() {}, onExit, onApplied() {}, onMerge() {}
    })
  ))
}

function work(id: string, title: string): Work {
  return {
    id, title, normalizedTitle: title.toLocaleLowerCase(), mediaType: 'manhwa', userStatus: 'reading',
    publicationStatus: null, description: null, countryCode: null, startDate: null, endDate: null,
    lastReadChapter: null, lastReadAt: null, rating: null, favorite: false, hiddenFromHome: false,
    notes: null, lastReadNote: null, cover: { type: 'none', sourceUrl: null, customPath: null, updatedAt: null },
    metadataUpdatedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null
  }
}
