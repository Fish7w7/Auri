import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { beginQuickSearch, completeQuickSearch, getQuickSearchPhase, normalizeQuickSearchSelection } from '@renderer/components/library/QuickSearchDialog'
import { getQuickSearchActions } from '@renderer/lib/quick-search'
import { runLatestLibraryRequest } from '@renderer/lib/latest-library-request'

describe('Busca Rápida global', () => {
  it('oferece recentes e as cinco ações principais quando vazia', () => {
    expect(getQuickSearchActions('').map((item) => item.label)).toEqual(['Adicionar obra', 'Home', 'Biblioteca', 'Coleções', 'Configurações'])
    expect(getQuickSearchPhase('', false, 5, false)).toBe('idle')
  })

  it('pesquisa navegação e ações por label ou palavras relacionadas', () => {
    expect(getQuickSearchActions('atualiza').map((item) => item.label)).toEqual(['Atualizações'])
    expect(getQuickSearchActions('brave').map((item) => item.label)).toEqual(['Extensão do navegador'])
    expect(getQuickSearchActions('criar').map((item) => item.label)).toEqual(['Adicionar obra'])
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
