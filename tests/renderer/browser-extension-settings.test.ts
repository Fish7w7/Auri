import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { BrowserExtensionView, beginManualInstallation, browserExtensionAction, type BrowserExtensionViewProps } from '@renderer/components/settings/BrowserExtensionSettings'
import { adjacentSettingsSection } from '@renderer/pages/SettingsPage'
import type { BrowserExtensionApi } from '@shared/contracts'

function props(): BrowserExtensionViewProps {
  return { status: { embeddedVersion: '0.2.0', embeddedAvailable: true, browsers: [
    { browser: 'edge', displayName: 'Microsoft Edge', installed: true, availableAction: 'store' },
    { browser: 'chrome', displayName: 'Google Chrome', installed: true, availableAction: 'manual' },
    { browser: 'brave', displayName: 'Brave', installed: true, availableAction: 'manual' }
  ] }, loading: false, busy: false, guide: null, feedback: null, onRetry: vi.fn(), onBegin: vi.fn(), onOpenPage: vi.fn(), onOpenFolder: vi.fn(), onCopyPath: vi.fn() }
}
const render = (value: BrowserExtensionViewProps) => renderToStaticMarkup(createElement(BrowserExtensionView, value))
describe('Configurações → Extensão do navegador', () => {
  it('mostra versão, loja Edge e instalação manual dos dois navegadores', () => {
    const html = render(props())
    expect(html).toContain('Auri Extension 0.2.0 incluída')
    expect(html).toContain('Abrir no Edge Add-ons')
    expect(html.match(/Começar instalação/g)).toHaveLength(2)
    expect(html).not.toContain('Extensão instalada')
    expect(html).toContain('Recarregar')
  })
  it.each(['edge', 'chrome', 'brave'])('não oferece ação principal para %s ausente', (browser) => {
    const value = props(); value.status!.browsers = value.status!.browsers.filter((b) => b.browser === browser).map((b) => ({ ...b, installed: false, availableAction: null }))
    const html = render(value)
    expect(html).toContain('Não encontrado neste computador.')
    expect(html).not.toContain('Começar instalação')
    expect(html).not.toContain('Abrir no Edge Add-ons')
    expect(html).not.toContain('Abrir extensões')
  })
  it.each(['chrome', 'brave'] as const)('guia %s tem passos, ações e foco acessível', (guide) => {
    const html = render({ ...props(), guide })
    expect(html).toContain('Modo do desenvolvedor')
    expect(html).toContain('Carregar sem compactação')
    expect(html).toContain('Selecione a pasta aberta pelo Auri')
    expect(html).toContain('Abrir pasta'); expect(html).toContain('Copiar caminho')
    expect(html).toContain('tabindex="-1"'); expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('aria-labelledby="browser-install-heading"')
  })
  it('exibe corrupção e permite tentar novamente sem guia enganoso', () => {
    const value = props(); value.status!.embeddedAvailable = false
    value.status!.browsers = value.status!.browsers.map((b) => ({ ...b, availableAction: b.browser === 'edge' ? 'store' : null }))
    const html = render({ ...value, guide: 'chrome' })
    expect(html).toContain('Os arquivos da Auri Extension não estão disponíveis nesta instalação.')
    expect(html).toContain('Tentar novamente'); expect(html).toContain('role="alert"')
    expect(html).not.toContain('Copiar caminho'); expect(html).not.toContain('Começar instalação')
  })
  it('loading e feedback usam regiões anunciadas; ações ocupadas ficam desabilitadas', () => {
    expect(render({ ...props(), loading: true })).toContain('Verificando navegadores')
    expect(render({ ...props(), busy: true, feedback: { kind: 'success', message: 'Caminho da extensão copiado.' } })).toContain('role="status"')
    expect(render({ ...props(), busy: true })).toContain('disabled=""')
    expect(render({ ...props(), feedback: { kind: 'error', message: 'Falha.' } })).toContain('role="alert"')
  })
  it.each(['chrome', 'brave'] as const)('fluxo %s chama as duas APIs corretas', async (browser) => {
    const api = { openExtensionsPage: vi.fn(async () => {}), openFolder: vi.fn(async () => {}) } as unknown as BrowserExtensionApi
    await beginManualInstallation(api, browser)
    expect(api.openExtensionsPage).toHaveBeenCalledWith(browser); expect(api.openFolder).toHaveBeenCalledWith()
  })
  it('falha parcial ainda tenta ambas as aberturas e permite recuperação', async () => {
    const api = { openExtensionsPage: vi.fn(async () => { throw new Error('failure') }), openFolder: vi.fn(async () => {}) } as unknown as BrowserExtensionApi
    await expect(beginManualInstallation(api, 'chrome')).rejects.toThrow('Use os botões abaixo')
    expect(api.openFolder).toHaveBeenCalled()
  })
  it('open/copy oferecem feedback e sanitizam erros na UI', async () => {
    expect(await browserExtensionAction(async () => {}, 'Pasta da extensão aberta.')).toEqual({ kind: 'success', message: 'Pasta da extensão aberta.' })
    expect(await browserExtensionAction(async () => {}, 'Caminho da extensão copiado.')).toEqual({ kind: 'success', message: 'Caminho da extensão copiado.' })
    const error = await browserExtensionAction(async () => { throw new Error('private path') }, 'ok')
    expect(error.kind).toBe('error'); expect(error.message).not.toContain('private path')
  })
  it('integra navegação por teclado e move foco ao guia', () => {
    expect(adjacentSettingsSection('updates', 'ArrowDown')).toBe('browser-extension')
    expect(adjacentSettingsSection('browser-extension', 'ArrowDown')).toBe('shortcuts')
    expect(adjacentSettingsSection('shortcuts', 'ArrowUp')).toBe('browser-extension')
    expect(readFileSync('src/renderer/src/components/settings/BrowserExtensionSettings.tsx', 'utf8')).toContain('guideRef.current?.focus()')
  })
})
