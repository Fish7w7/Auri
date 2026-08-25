import { createElement } from 'react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { adjacentSettingsSection, backupCountLabel, cardPreviewCount, formatIntegrityCheckedAt, SETTINGS_SECTIONS } from '@renderer/pages/SettingsPage'
import { ConfirmDialog, Dialog, runDialogAction } from '@renderer/components/ui/Dialog'
import { Button } from '@renderer/components/ui/Button'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('modais, Configurações e title bar do Auri', () => {
  it('expõe a nova arquitetura de Configurações sem uma categoria genérica Avançado', () => {
    const labels: readonly string[] = SETTINGS_SECTIONS.map((item) => item.label)
    expect(labels).toEqual([
      'Aparência',
      'Biblioteca e Home',
      'Backup e dados',
      'Atualizações',
      'Atalhos',
      'Manutenção',
      'Sobre'
    ])
    expect(labels.includes('Avançado')).toBe(false)
  })

  it('navega pelas categorias com setas, Home e End', () => {
    expect(adjacentSettingsSection('appearance', 'ArrowUp')).toBe('about')
    expect(adjacentSettingsSection('appearance', 'ArrowDown')).toBe('library')
    expect(adjacentSettingsSection('about', 'ArrowDown')).toBe('appearance')
    expect(adjacentSettingsSection('maintenance', 'Home')).toBe('appearance')
    expect(adjacentSettingsSection('library', 'End')).toBe('about')
  })
  it('expõe os estados visuais e resumos da nova experiência', () => {
    expect(cardPreviewCount('small')).toBe(5)
    expect(cardPreviewCount('medium')).toBe(4)
    expect(cardPreviewCount('large')).toBe(3)
    expect(backupCountLabel(0)).toBe('0 backups armazenados')
    expect(backupCountLabel(1)).toBe('1 backup armazenado')
    expect(formatIntegrityCheckedAt('2026-08-25T14:42:00-03:00', new Date('2026-08-25T18:00:00-03:00'))).toContain('Verificado hoje')
  })

  it('remove a ordenação redundante e mantém o gerenciador dedicado de backups', () => {
    const settings = readFileSync(join(process.cwd(), 'src/renderer/src/pages/SettingsPage.tsx'), 'utf8')
    const library = readFileSync(join(process.cwd(), 'src/renderer/src/pages/LibraryPage.tsx'), 'utf8')
    expect(settings).not.toContain('Ordenação padrão')
    expect(settings).toContain('última ordenação usada na Biblioteca')
    expect(settings).toContain('backup-manager-list')
    expect(settings).toContain('Gerenciar backups')
    expect(library).toContain('updateSettings({ librarySort: sort })')
  })

  it('mantém semântica, descrição, loading e erro no modal compartilhado', () => {
    const html = renderToStaticMarkup(createElement(Dialog, {
      open: true,
      title: 'Operação não concluída',
      description: 'Descrição associada.',
      busy: true,
      error: 'Falha tratada dentro do Auri.',
      onClose() {},
      footer: createElement(Button, null, 'Fechar')
    }))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-describedby=')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="alert"')
  })

  it('mantém o modal aberto e apresenta o erro de uma ação assíncrona', async () => {
    const errors: string[] = []
    await expect(runDialogAction(async () => { throw new Error('Backup bloqueado para teste.') }, (message) => errors.push(message))).resolves.toBe(false)
    expect(errors).toEqual(['Backup bloqueado para teste.'])
  })

  it('usa cancelamento como foco inicial seguro em confirmações destrutivas', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, {
      open: true,
      title: 'Excluir backup?',
      description: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir backup',
      danger: true,
      onClose() {},
      onConfirm() {}
    }))
    expect(html).toContain('data-dialog-initial-focus="true"')
    expect(html).toContain('button--danger')
    expect(html).toContain('Cancelar')
    expect(html).toContain('Excluir backup')
  })

  it('não usa confirm, alert ou prompt nativos no Renderer', () => {
    const renderer = join(process.cwd(), 'src/renderer/src')
    const source = sourceFiles(renderer).map((file) => readFileSync(file, 'utf8')).join('\n')
    expect(source).not.toMatch(/window\.(?:confirm|alert|prompt)\s*\(/)
    expect(source).not.toMatch(/(?:globalThis|self)\.(?:confirm|alert|prompt)\s*\(/)
  })

  it('mantém dialogs de sistema somente no fluxo de recuperação anterior ao Renderer', () => {
    const source = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const recovery = source.indexOf('async function showStartupRecovery')
    const messageBoxes = [...source.matchAll(/dialog\.showMessageBox\s*\(/g)].map((match) => match.index ?? -1)
    expect(messageBoxes.length).toBeGreaterThan(0)
    expect(messageBoxes.every((index) => index > recovery)).toBe(true)
  })

  it('integra o divisor à title bar inteira sem uma camada azul separada no frame', () => {
    const css = readFileSync(join(process.cwd(), 'src/renderer/src/styles/global.css'), 'utf8')
    const windowSetup = readFileSync(join(process.cwd(), 'src/main/windows/create-main-window.ts'), 'utf8')
    expect(css).not.toContain('.window-frame::after')
    expect(css).toMatch(/\.window-titlebar \{[^}]*box-shadow: inset 0 -1px var\(--shimmer-highlight\)/)
    expect(windowSetup).toContain("titleBarStyle: 'hidden'")
    expect(windowSetup).toContain('titleBarOverlay: {')
    expect(windowSetup).toContain("color: '#00000000'")
    expect(windowSetup).not.toMatch(/titleBarOverlay:\s*\{[^}]*height:/s)
  })
})
