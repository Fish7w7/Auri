import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfirmDialog } from '@renderer/components/ui/Dialog'
import { backupTypeLabel, backupWorkCountLabel, formatBackupDate, formatBackupMetadata } from '@renderer/pages/SettingsPage'

describe('apresentação amigável de backups e confirmações', () => {
  it('humaniza tipos e datas de backup', () => {
    const now = new Date(2026, 7, 28, 12, 0)
    expect(backupTypeLabel('manual')).toBe('Backup manual')
    expect(backupTypeLabel('auto')).toBe('Backup automático')
    expect(backupTypeLabel('before_restore')).toBe('Antes da restauração')
    expect(backupTypeLabel('before_import')).toBe('Antes da importação')
    expect(backupTypeLabel('before_migration')).toBe('Antes da migração')
    expect(formatBackupDate(new Date(2026, 7, 28, 2, 26).toISOString(), now)).toBe('Hoje, 02:26')
    expect(formatBackupDate(new Date(2026, 7, 27, 17, 35).toISOString(), now)).toBe('Ontem, 17:35')
    expect(formatBackupDate(new Date(2025, 7, 28, 2, 47).toISOString(), now)).toContain('28 de agosto de 2025, 02:47')
  })

  it('omite a quantidade desconhecida sem renderizar -1 obras', () => {
    expect(backupWorkCountLabel(-1)).toBeNull()
    expect(formatBackupMetadata({ size: 47 * 1024, workCount: -1 })).toBe('47 KB')
    expect(formatBackupMetadata({ size: 47 * 1024, workCount: 21 })).toBe('47 KB • 21 obras')
  })

  it('separa contexto, explicação e alerta na confirmação pequena', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, {
      open: true,
      title: 'Excluir permanentemente?',
      context: createElement('strong', null, 'Obra de teste'),
      description: 'Os dados vinculados serão excluídos.',
      warning: 'Não será possível desfazer.',
      confirmLabel: 'Excluir permanentemente',
      danger: true,
      onClose() {},
      onConfirm() {}
    }))
    expect(html).toContain('dialog--small')
    expect(html).toContain('confirm-dialog__context')
    expect(html).toContain('Obra de teste')
    expect(html).toContain('Não será possível desfazer.')
    expect(html).toContain('button--danger')
    expect(html).toContain('data-dialog-initial-focus="true"')
  })
})
