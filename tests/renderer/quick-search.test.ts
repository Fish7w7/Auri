import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { beginQuickSearch, completeQuickSearch, getQuickSearchPhase, normalizeQuickSearchSelection } from '@renderer/components/library/QuickSearchDialog'
import { dispatchQuickSearchAction, getQuickSearchActions } from '@renderer/lib/quick-search'
import { getQuickSearchScroll } from '@renderer/lib/quick-search-scroll'
import { runLatestLibraryRequest } from '@renderer/lib/latest-library-request'

describe('Busca Rápida global', () => {
  it('prioriza ações recentes e mantém sugestões sem duplicatas', () => {
    const actions = getQuickSearchActions('', ['statistics', 'history', 'statistics', 'removed'])
    expect(actions.slice(0, 3).map((item) => item.id)).toEqual(['statistics', 'history', 'add-work'])
    expect(actions.filter((item) => item.id === 'statistics')).toHaveLength(1)
    expect(getQuickSearchPhase('', false, 5, false)).toBe('idle')
  })

  it('pesquisa navegação e ações por label ou palavras relacionadas', () => {
    expect(getQuickSearchActions('atualiza').map((item) => item.label)).toEqual(['Atualizações', 'Atualizar progresso'])
    expect(getQuickSearchActions('brave').map((item) => item.label)).toEqual(['Extensão do navegador'])
    expect(getQuickSearchActions('criar').map((item) => item.label)).toEqual(['Adicionar obra'])
    expect(getQuickSearchActions('progresso atualizar')[0].id).toBe('progress')
  })

  it('encaminha comandos tipados para os fluxos de navegação e de obra', () => {
    const handlers = { navigate: vi.fn(), add: vi.fn(), resume: vi.fn(), work: vi.fn() }
    for (const query of ['Estatísticas', 'Editar obra', 'Atualizar progresso', 'Histórico de leitura', 'Continuar a última leitura', 'Adicionar obra']) {
      dispatchQuickSearchAction(getQuickSearchActions(query)[0], handlers)
    }
    expect(handlers.navigate).toHaveBeenCalledWith('/statistics')
    expect(handlers.work.mock.calls).toEqual([['edit'], ['progress'], ['history']])
    expect(handlers.add).toHaveBeenCalledOnce()
    expect(handlers.resume).toHaveBeenCalledOnce()
  })

  it('preserva o resultado anterior durante a consulta e só mostra vazio ao concluir', () => {
    const accepted = completeQuickSearch('so', [{ id: 'work-old' }])
    const pending = beginQuickSearch(accepted)
    expect(pending.results).toBe(accepted.results)
    expect(pending.settledQuery).toBe('so')
    expect(getQuickSearchPhase('sol', true, pending.results.length, false)).toBe('loading')
    expect(getQuickSearchPhase('sol', false, 0, false)).toBe('empty')
  })

  it('mantém a seleção por ID quando o item continua e normaliza quando desaparece', () => {
    const updated = [{ id: 'work:new' }, { id: 'work:kept' }]
    expect(normalizeQuickSearchSelection(updated, 'work:kept')).toBe('work:kept')
    expect(normalizeQuickSearchSelection(updated, 'work:removed')).toBe('work:new')
    expect(normalizeQuickSearchSelection([], 'work:removed')).toBeNull()
  })

  it('mostra a opção selecionada inteira sem cortar a anterior no topo', () => {
    const options = Array.from({ length: 6 }, (_, index) => ({ top: 27 + index * 60, bottom: 84 + index * 60 }))
    const geometry = { options, height: 330, contentHeight: 384 }
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 0, selectedIndex: 4 })).toEqual({ top: 0, endSpace: 30 })
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 0, selectedIndex: 5 })).toEqual({ top: 84, endSpace: 30 })
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 84, selectedIndex: 0 }).top).toBe(0)
  })

  it('alinha a opção anterior ao subir e corrige um topo parcial ao voltar ao teclado', () => {
    const options = Array.from({ length: 6 }, (_, index) => ({ top: 27 + index * 60, bottom: 84 + index * 60 }))
    const geometry = { options, height: 242, contentHeight: 384 }
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 144, selectedIndex: 1 }).top).toBe(87)
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 100, selectedIndex: 3 }).top).toBe(144)
    expect(getQuickSearchScroll({ ...geometry, scrollTop: 100, selectedIndex: -1 }).top).toBeNull()
  })

  it('mantém uma lista curta no topo e revela a primeira opção após conteúdo auxiliar', () => {
    expect(getQuickSearchScroll({
      scrollTop: 0, height: 200, contentHeight: 200, options: [{ top: 27, bottom: 84 }], selectedIndex: 0
    })).toEqual({ top: 0, endSpace: 0 })
    expect(getQuickSearchScroll({
      scrollTop: 0, height: 110, contentHeight: 157, options: [{ top: 100, bottom: 157 }], selectedIndex: 0
    })).toEqual({ top: 47, endSpace: 0 })
  })

  it('impede que uma resposta obsoleta substitua a consulta mais nova', async () => {
    const generation = { current: 0 }
    const hasAcceptedResult = { current: false }
    const accepted: string[][] = []
    let resolveOld: (value: string[]) => void = () => undefined
    const oldRequest = new Promise<string[]>((resolve) => { resolveOld = resolve })
    const run = (request: Promise<string[]>) => runLatestLibraryRequest({
      generation,
      hasAcceptedResult,
      request: () => request,
      onStart: vi.fn(),
      onSuccess: (items) => accepted.push(items),
      onError: vi.fn(),
      onSettled: vi.fn()
    })

    const oldRun = run(oldRequest)
    await run(Promise.resolve(['new']))
    resolveOld(['old'])
    await oldRun
    expect(accepted).toEqual([['new']])
  })

  it('mantém input e keys estáveis, teclado, badge e foco sem borda duplicada', () => {
    const source = readFileSync(join(process.cwd(), 'src/renderer/src/components/library/QuickSearchDialog.tsx'), 'utf8')
    const appSource = readFileSync(join(process.cwd(), 'src/renderer/src/app/App.tsx'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    expect(source).toContain("event.key === 'ArrowDown'")
    expect(source).toContain("event.key === 'ArrowUp'")
    expect(source).toContain("event.key === 'Enter'")
    expect(source).toContain('Oculta da Home')
    expect(source).toContain('runLatestLibraryRequest')
    expect(source).toContain('key={work.id}')
    expect(source).toContain('key={action.id}')
    expect(source).not.toContain("phase === 'loading' && <p")
    expect(source).not.toContain('key={query}')
    expect(appSource).toContain('<QuickSearchDialog open={quickSearchOpen}')
    expect(css).toMatch(/\.quick-search__results\s*\{[^}]*min-height:/)
    expect(css).toMatch(/\.quick-search__field input:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/)
  })
})
