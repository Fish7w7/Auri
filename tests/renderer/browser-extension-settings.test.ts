import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { BrowserExtensionView, beginManualInstallation, browserExtensionAction, manualInstallationFeedback, browserOpeningFeedback, openBrowserFromGuide, type BrowserExtensionViewProps } from '@renderer/components/settings/BrowserExtensionSettings'
import { adjacentSettingsSection } from '@renderer/pages/SettingsPage'
import type { BrowserExtensionApi } from '@shared/contracts'

function props(): BrowserExtensionViewProps {
  return { status: { embeddedVersion: '0.2.0', embeddedAvailable: true, browsers: [
    { browser: 'edge', displayName: 'Microsoft Edge', installed: true, availableAction: 'store' },
    { browser: 'chrome', displayName: 'Google Chrome', installed: true, availableAction: 'manual' },
    { browser: 'brave', displayName: 'Brave', installed: true, availableAction: 'manual' }
  ] }, loading: false, loadError: false, busy: null, guide: null, edgeHelp: false, onRefresh: vi.fn(), onBegin: vi.fn(), onOpenPage: vi.fn(), onOpenFolder: vi.fn(), onCopyPath: vi.fn(), onCopyUrl: vi.fn() }
}
const render = (value: BrowserExtensionViewProps) => renderToStaticMarkup(createElement(BrowserExtensionView, value))
describe('Configurações → Extensão do navegador', () => {
  it('mostra três cards, versão discreta, loja Edge e ações específicas', () => {
    const html = render(props())
    expect(html.match(/class="browser-extension-card"/g)).toHaveLength(3)
    for (const text of ['Auri Extension', '0.2.0 incluída', 'Abrir no Edge Add-ons', 'Instalar no Chrome', 'Instalar no Brave', 'Atualizar detecção']) expect(html).toContain(text)
    expect(html.match(/>Detectado</g)).toHaveLength(3)
    for (const text of ['Extensão instalada', 'Tentar novamente', 'Recarregar', 'Página de extensões aberta']) expect(html).not.toContain(text)
    expect(html).toContain('<aside')
  })
  it.each(['edge', 'chrome', 'brave'])('card %s ausente não oferece controles', (browser) => {
    const value = props()
    value.status!.browsers = value.status!.browsers.filter((b) => b.browser === browser).map((b) => ({ ...b, installed: false, availableAction: null }))
    const html = render(value)
    const card = html.slice(html.indexOf('<section'), html.indexOf('</section>'))
    expect(card).toContain('Não encontrado')
    expect(card).toContain('is-unavailable')
    expect(card).not.toContain('<button')
  })
  it.each(['chrome', 'brave'] as const)('guia único %s tem três passos e fallback manual sem roubar foco', (guide) => {
    const html = render({ ...props(), guide })
    expect(html.match(/id="browser-install-guide"/g)).toHaveLength(1)
    expect(html.match(/<li>/g)).toHaveLength(3)
    for (const text of ['Modo do desenvolvedor', 'Carregar sem compactação', 'Selecione a pasta preparada pelo Auri', 'Abrir pasta', 'Copiar caminho', 'Recarregar', 'cole na barra de endereço', guide + '://extensions/', 'Copiar endereço']) expect(html).toContain(text)
    expect(html).toContain('id="browser-install-heading">Instalar no ' + (guide === 'brave' ? 'Brave' : 'Chrome'))
    expect(html).not.toContain('tabindex="-1"')
    expect(html).toContain('aria-expanded="true"')
  })
  it('Edge tem fallback específico após sua ação secundária', () => {
    expect(render({ ...props(), edgeHelp: true })).toContain('Copiar edge://extensions/')
    expect(render(props())).not.toContain('Copiar edge://extensions/')
  })
  it('Embedded indisponível oculta guia e preserva aviso e loja', () => {
    const value = props(); value.status!.embeddedAvailable = false
    value.status!.browsers = value.status!.browsers.map((b) => ({ ...b, availableAction: b.browser === 'edge' ? 'store' : null }))
    const html = render({ ...value, guide: 'chrome' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Abrir no Edge Add-ons')
    expect(html).not.toContain('Copiar caminho')
    expect(html).not.toContain('Tentar novamente')
  })
  it('atualização que remove navegador também oculta guia obsoleto', () => {
    const value = props(); value.status!.browsers[2].installed = false
    expect(render({ ...value, guide: 'brave' })).not.toContain('id="browser-install-guide"')
  })
  it('retry só aparece em erro real de detecção, inclusive sem status anterior', () => {
    expect(render({ ...props(), status: null, loadError: true })).toContain('Tentar novamente')
    expect(render({ ...props(), loadError: true })).toContain('Os resultados anteriores foram mantidos')
    expect(render(props())).not.toContain('Tentar novamente')
  })
  it('loading anunciado e indicador apenas na ação em execução', () => {
    expect(render({ ...props(), loading: true })).toContain('role="status"')
    const html = render({ ...props(), busy: 'install-brave', guide: 'brave' })
    expect(html.match(/Preparando…/g)).toHaveLength(1)
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('browser-extension-feedback')
  })
  it.each(['chrome', 'brave'] as const)('aguarda a conclusão da pasta antes de solicitar %s', async (browser) => {
    let finishFolder!: () => void
    const folder = new Promise<void>((resolve) => { finishFolder = resolve })
    const api = { openExtensionsPage: vi.fn(async () => ({ state: 'launch-requested' })), openFolder: vi.fn(() => folder) } as unknown as BrowserExtensionApi
    const installation = beginManualInstallation(api, browser)
    expect(api.openFolder).toHaveBeenCalledOnce()
    expect(api.openExtensionsPage).not.toHaveBeenCalled()
    finishFolder()
    const result = await installation
    expect(api.openExtensionsPage).toHaveBeenCalledExactlyOnceWith(browser)
    expect(result).toEqual({ folder: 'opened', browser: 'launch-requested' })
    expect(manualInstallationFeedback(result, browser)?.message).toContain('não estava em execução')
  })
  it.each([
    [true, false, 'Pasta aberta, mas não foi possível abrir a página', 'error'],
    [false, true, 'Não foi possível abrir a pasta', 'warning'],
    [false, false, 'Não foi possível abrir a pasta nem solicitar', 'error']
  ] as const)('falha parcial pasta=%s navegador=%s identifica a etapa', async (folder, browser, message, kind) => {
    const api = {
      openFolder: vi.fn(async () => { if (!folder) throw new Error('private folder') }),
      openExtensionsPage: vi.fn(async () => { if (!browser) throw new Error('private browser'); return { state: 'launch-requested' } })
    } as unknown as BrowserExtensionApi
    const result = await beginManualInstallation(api, 'brave')
    expect(api.openFolder).toHaveBeenCalledOnce(); expect(api.openExtensionsPage).toHaveBeenCalledOnce()
    const feedback = manualInstallationFeedback(result, 'brave')
    expect(feedback?.kind).toBe(kind); expect(feedback?.message).toContain(message)
    expect(feedback?.message).not.toContain('private')
    expect(feedback?.message).not.toContain('Página de extensões e pasta abertas')
  })
  it('toasts de abrir/copiar são específicos e navegação nunca é confirmada', async () => {
    expect(await browserExtensionAction(async () => {}, 'Pasta aberta.', 'Falha na pasta.')).toEqual({ kind: 'success', message: 'Pasta aberta.' })
    expect(await browserExtensionAction(async () => {}, 'Solicitação enviada.', 'Falha no navegador.', 'info')).toEqual({ kind: 'info', message: 'Solicitação enviada.' })
    expect(await browserExtensionAction(async () => { throw new Error('private') }, 'ok', 'Falha ao copiar.')).toEqual({ kind: 'error', message: 'Falha ao copiar.' })
  })
  it.each(['chrome', 'brave'] as const)('preserva abertura da pasta e informa instância de %s existente', async (browser) => {
    const api = { openFolder: vi.fn(async () => {}), openExtensionsPage: vi.fn(async () => ({ state: 'already-running' })) } as unknown as BrowserExtensionApi
    const result = await beginManualInstallation(api, browser)
    expect(api.openFolder).toHaveBeenCalledOnce()
    expect(result).toEqual({ folder: 'opened', browser: 'already-running' })
    const feedback = manualInstallationFeedback(result, browser)
    expect(feedback?.message).toContain('já está em execução')
    expect(feedback?.message).toContain('janela que você já usa')
    expect(feedback?.message).not.toContain('abertura foi solicitada')
  })
  it.each(['chrome', 'brave', 'edge'] as const)('ação individual do guia %s respeita instância aberta', async (browser) => {
    const api = { openExtensionsPage: vi.fn(async () => ({ state: 'already-running' })) } as unknown as BrowserExtensionApi
    expect((await openBrowserFromGuide(api, browser)).message).toContain('já está em execução')
    expect(api.openExtensionsPage).toHaveBeenCalledExactlyOnceWith(browser)
  })
  it('falha de detecção orienta navegação manual sem alegar navegador fechado', () => {
    const feedback = browserOpeningFeedback({ state: 'unknown' }, 'brave')
    expect(feedback.kind).toBe('warning')
    expect(feedback.message).toContain('Não foi possível verificar')
    expect(feedback.message).not.toContain('não estava em execução')
    expect(manualInstallationFeedback({ folder: 'failed', browser: 'unknown' }, 'brave')?.message).toContain('Não foi possível abrir a pasta')
  })
  it('preserva navegação por teclado e não transfere foco ao guia', () => {
    expect(adjacentSettingsSection('updates', 'ArrowDown')).toBe('browser-extension')
    expect(adjacentSettingsSection('browser-extension', 'ArrowDown')).toBe('shortcuts')
    expect(adjacentSettingsSection('shortcuts', 'ArrowUp')).toBe('browser-extension')
    const source = readFileSync('src/renderer/src/components/settings/BrowserExtensionSettings.tsx', 'utf8')
    expect(source).not.toContain('.focus(')
    expect(source).toContain('showToast({ ...feedback, dedupeKey:')
  })
})
