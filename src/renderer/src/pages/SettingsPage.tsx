import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { BackupPreview, BackupState, CoverCacheUsage, ImportPreview, LibrarySort, LibraryView, SystemDiagnostics, SystemStatus } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { useAppContext } from '../app/app-context'
import { BrandMark } from '../components/shell/BrandMark'
import { SettingRow } from '../components/settings/SettingRow'
import { UpdatesSettings } from '../components/settings/UpdatesSettings'
import { Button } from '../components/ui/Button'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { Select } from '../components/ui/Select'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { applyLibraryImport } from '../lib/apply-library-import'

export const SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Aparência' },
  { id: 'library', label: 'Biblioteca' },
  { id: 'backup-data', label: 'Backup e dados' },
  { id: 'updates', label: 'Atualizações' },
  { id: 'shortcuts', label: 'Atalhos' },
  { id: 'maintenance', label: 'Manutenção' },
  { id: 'about', label: 'Sobre' }
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

export function adjacentSettingsSection(current: SettingsSection, key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'): SettingsSection {
  if (key === 'Home') return SETTINGS_SECTIONS[0].id
  if (key === 'End') return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id
  const index = SETTINGS_SECTIONS.findIndex((item) => item.id === current)
  const offset = key === 'ArrowDown' ? 1 : -1
  return SETTINGS_SECTIONS[(index + offset + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length].id
}

const sortLabels: Record<LibrarySort, string> = {
  last_read_desc: 'Última leitura',
  last_read_asc: 'Mais tempo sem ler',
  title_asc: 'Título A–Z',
  title_desc: 'Título Z–A',
  created_desc: 'Adicionado recentemente',
  updated_desc: 'Atualizado recentemente',
  chapter_desc: 'Capítulo',
  rating_desc: 'Nota'
}

export function SettingsPage() {
  const { settings, updateSettings, refreshData } = useAppContext()
  const [section, setSection] = useState<SettingsSection>('appearance')
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null)
  const [diagnosticError, setDiagnosticError] = useState(false)
  const [cache, setCache] = useState<CoverCacheUsage | null>(null)
  const [backup, setBackup] = useState<BackupState | null>(null)
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [deleteBackup, setDeleteBackup] = useState<BackupState['backups'][number] | null>(null)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const { showToast } = useToast()

  const loadCache = useCallback(() => void window.auri.covers.usage().then(setCache).catch(() => setCache(null)), [])
  const loadDiagnostics = async () => {
    const next = await window.auri.system.getDiagnostics()
    setDiagnostics(next)
    setSystem(next.status)
    setDiagnosticError(false)
  }

  useEffect(() => {
    void window.auri.system.getStatus().then(setSystem)
    loadCache()
  }, [loadCache])
  useEffect(() => {
    const refresh = () => loadCache()
    window.addEventListener('auri:cover-cache-changed', refresh)
    return () => window.removeEventListener('auri:cover-cache-changed', refresh)
  }, [loadCache])
  useEffect(() => {
    if (section === 'backup-data') void window.auri.backup.state().then(setBackup).catch((error) => showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar os backups.' }))
  }, [section, settings, showToast])
  useEffect(() => {
    if (section === 'maintenance') void loadDiagnostics().catch(() => {
      setDiagnostics(null)
      setDiagnosticError(true)
    })
  }, [section])
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [section])

  const navigateSection = (next: SettingsSection, focus = false) => {
    setSection(next)
    if (focus) window.requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>(`[data-settings-section="${next}"]`)?.focus())
  }

  const handleNavigationKey = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    navigateSection(adjacentSettingsSection(section, event.key as 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'), true)
  }

  const dataAction = async (action: () => Promise<boolean | void>, success: string) => {
    setBusy(true)
    try {
      const completed = await action()
      if (completed === false) return
      setBackup(await window.auri.backup.state())
      showToast({ kind: 'success', message: success })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' })
    } finally {
      setBusy(false)
    }
  }

  const confirmBackupDeletion = async () => {
    if (!deleteBackup) return
    await window.auri.backup.delete({ path: deleteBackup.path })
    setBackup(await window.auri.backup.state())
    showToast({ kind: 'success', message: 'Backup excluído.' })
    setDeleteBackup(null)
  }

  const confirmRestore = async () => {
    if (!restorePreview) return
    await window.auri.backup.restore({ path: restorePreview.path })
    setRestorePreview(null)
  }

  return <div className="page settings-page">
    <header className="page-header"><div><span className="page-kicker">Preferências do aplicativo</span><h1>Configurações</h1></div></header>
    <div className="settings-layout">
      <nav ref={navRef} aria-label="Seções de Configurações" onKeyDown={handleNavigationKey}>
        {SETTINGS_SECTIONS.map((item) => <button key={item.id} data-settings-section={item.id} aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? 'is-active' : ''} onClick={() => navigateSection(item.id)}>{item.label}</button>)}
      </nav>
      <section ref={panelRef} className="settings-panel" aria-live="polite">
        {section === 'appearance' && <>
          <SettingsHeading title="Aparência" description="Ajuste a densidade visual do Auri sem alterar seus dados." />
          <SettingsGroup title="Biblioteca em grade" description="Escolha o espaço ocupado por cada capa na visualização em grade.">
            <SettingRow title="Tamanho dos cards" description="Cards menores mostram mais obras por linha; cards maiores destacam as capas.">
              <div className="size-segmented" role="group" aria-label="Tamanho dos cards">{([['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']] as const).map(([cardSize, label]) => <button key={cardSize} className={settings.cardSize === cardSize ? 'is-active' : ''} aria-pressed={settings.cardSize === cardSize} onClick={() => void updateSettings({ cardSize })}>{label}</button>)}</div>
            </SettingRow>
          </SettingsGroup>
        </>}

        {section === 'library' && <>
          <SettingsHeading title="Biblioteca" description="Defina como sua coleção aparece quando a Biblioteca é aberta." />
          <SettingsGroup title="Visualização inicial" description="Filtros temporários continuam valendo apenas durante o uso atual.">
            <SettingRow title="Modo de visualização" description="Exibe as obras em uma grade de capas ou em uma lista compacta.">
              <Select label="Visualização padrão" value={settings.libraryView} onChange={(libraryView) => void updateSettings({ libraryView: libraryView as LibraryView })} options={[{ value: 'grid', label: 'Grade' }, { value: 'list', label: 'Lista' }]} />
            </SettingRow>
            <SettingRow title="Ordenação padrão" description="Ordem usada ao abrir a Biblioteca sem uma ordenação temporária.">
              <Select label="Ordenação padrão" value={settings.librarySort} onChange={(librarySort) => void updateSettings({ librarySort: librarySort as LibrarySort })} options={Object.entries(sortLabels).map(([value, label]) => ({ value, label }))} />
            </SettingRow>
          </SettingsGroup>
        </>}

        {section === 'backup-data' && <>
          <SettingsHeading title="Backup e dados" description="Proteja a instalação completa ou mova sua Biblioteca entre instalações do Auri." />

          <SettingsActionGroup title="Backup manual" description="Cria agora uma cópia completa do banco, preferências e arquivos permanentes.">
            <Button variant="primary" disabled={busy} onClick={() => void dataAction(async () => { await window.auri.backup.create() }, 'Backup criado com sucesso.')}>Criar backup</Button>
          </SettingsActionGroup>

          <SettingsGroup title="Backups automáticos" description="Cópias de recuperação criadas sem incluir caches temporários.">
            <SettingRow title="Criar automaticamente" description="Mantém cópias recentes sem exigir uma ação manual.">
              <label className="setting-toggle"><input type="checkbox" checked={settings.backupAutomatic} onChange={(event) => void updateSettings({ backupAutomatic: event.target.checked })} /><span>{settings.backupAutomatic ? 'Ativado' : 'Desativado'}</span></label>
            </SettingRow>
            <SettingRow title="Frequência" description="Intervalo entre os backups automáticos.">
              <Select label="Frequência" value={settings.backupFrequency} onChange={(backupFrequency) => void updateSettings({ backupFrequency: backupFrequency as 'daily' | 'weekly' })} options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal' }]} />
            </SettingRow>
            <SettingRow title="Retenção" description="Quantidade máxima de backups automáticos mantidos.">
              <Select label="Retenção" value={String(settings.backupRetention)} onChange={(backupRetention) => void updateSettings({ backupRetention: Number(backupRetention) })} options={[5, 10, 20, 30].map((value) => ({ value: String(value), label: `${value} backups` }))} />
            </SettingRow>
            <SettingRow title="Pasta dos backups" description={<span className={!backup?.directoryAvailable ? 'setting-warning' : ''}>{backup?.directory ?? 'Carregando…'}{backup && !backup.directoryAvailable ? ' · Pasta indisponível; o Auri usará a pasta padrão.' : ''}</span>}>
              <div className="setting-inline"><Button disabled={busy} onClick={() => void dataAction(() => window.auri.backup.openFolder(), 'Pasta de backups aberta.')}>Abrir pasta</Button><Button disabled={busy} onClick={() => void dataAction(async () => { const state = await window.auri.backup.chooseDirectory(); if (!state) return false; setBackup(state) }, 'Pasta de backups atualizada.')}>Alterar pasta</Button></div>
            </SettingRow>
          </SettingsGroup>

          <SettingsActionGroup title="Restauração" description="Substitui os dados atuais pelos dados de um backup completo. Antes disso, o Auri cria uma cópia de segurança.">
            <Button disabled={busy} onClick={() => void dataAction(async () => { const preview = await window.auri.backup.chooseRestore(); if (!preview) return false; setRestorePreview(preview); return false }, '')}>Escolher backup</Button>
          </SettingsActionGroup>

          <SettingsActionGroup title="Portabilidade" description="JSON transfere a Biblioteca editável; CSV cria um resumo para consulta.">
            <Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.auri.transfer.exportJson()), 'Biblioteca exportada em JSON.')}>Exportar JSON</Button>
            <Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.auri.transfer.exportCsv()), 'Resumo exportado em CSV.')}>Exportar CSV</Button>
            <Button disabled={busy} onClick={async () => { try { const preview = await window.auri.transfer.chooseImport(); if (preview) setImportPreview(preview) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Arquivo de importação inválido.' }) } }}>Importar biblioteca</Button>
          </SettingsActionGroup>

          <div className="backup-list"><h3>Backups disponíveis</h3><p className="settings-section-copy">Cópias completas armazenadas na pasta configurada.</p>{backup?.backups.length ? backup.backups.map((item) => <article key={item.path}><div><strong>{backupTypeLabel(item.type)}</strong><span className="backup-file" title={item.fileName}>{item.fileName}</span><p>{new Date(item.createdAt).toLocaleString('pt-BR')} · {formatBytes(item.size)} · {item.workCount} obras</p></div><Button variant="danger" disabled={busy} onClick={() => setDeleteBackup(item)}>Excluir</Button></article>) : <p className="muted-copy">Nenhum backup criado nesta pasta.</p>}</div>
        </>}

        {section === 'updates' && <UpdatesSettings />}

        {section === 'shortcuts' && <>
          <SettingsHeading title="Atalhos" description="Comandos de teclado para navegar e editar com mais rapidez." />
          <dl className="shortcut-list"><div><dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Abrir a busca rápida da Biblioteca</dd></div><div><dt><kbd>Ctrl</kbd> + <kbd>N</kbd></dt><dd>Adicionar uma nova obra</dd></div><div><dt><kbd>/</kbd></dt><dd>Focar a pesquisa da página atual</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Fechar o elemento atual ou sair da seleção</dd></div><div><dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>Salvar o formulário em edição</dd></div></dl>
        </>}

        {section === 'maintenance' && <MaintenanceSettings diagnostics={diagnostics} cache={cache} cacheLimitMb={settings.coverCacheMaxMb} loadError={diagnosticError} busy={busy} onBusy={setBusy} reload={loadDiagnostics} showToast={showToast} />}

        {section === 'about' && <>
          <SettingsHeading title="Sobre" description={`Informações desta instalação do ${APP_BRAND.name}.`} />
          <div className="about-brand"><BrandMark large /><div><strong>{APP_BRAND.name}</strong><p>{APP_BRAND.tagline}</p></div></div>
          {system && <dl className="about-details"><div><dt>Versão do aplicativo</dt><dd>{system.appVersion}</dd></div><div><dt>Banco de dados</dt><dd>Schema {system.database.schemaVersion}</dd></div><div><dt>Formato de backup</dt><dd>Versão {system.backupFormatVersion}</dd></div><div><dt>Plataforma</dt><dd>{system.platform.label}</dd></div></dl>}
        </>}
      </section>
    </div>

    <ConfirmDialog open={!!deleteBackup} title="Excluir backup?" description={deleteBackup ? <>O backup <span className="dialog__filename" title={deleteBackup.fileName}>“{deleteBackup.fileName}”</span> será excluído permanentemente.</> : ''} confirmLabel="Excluir backup" danger onClose={() => setDeleteBackup(null)} onConfirm={confirmBackupDeletion} />
    <ConfirmDialog open={!!restorePreview} title="Restaurar backup?" description={restorePreview ? `Este backup foi criado em ${new Date(restorePreview.createdAt).toLocaleString('pt-BR')} e contém ${restorePreview.workCount} obras. O ${APP_BRAND.name} criará uma cópia de segurança dos dados atuais e reiniciará após a restauração.` : ''} confirmLabel="Restaurar e reiniciar" danger onClose={() => setRestorePreview(null)} onConfirm={confirmRestore} />
    <Dialog open={!!importPreview} title="Revisar importação" description={importPreview ? `${importPreview.total} obras: ${importPreview.newWorks} novas, ${importPreview.exactMatches} correspondências exatas, ${importPreview.probableMatches} prováveis, ${importPreview.trashMatches} na Lixeira e ${importPreview.conflicts} conflitos.` : ''} busy={busy} onClose={() => { if (!busy) setImportPreview(null) }}><div className="import-preview"><p>Correspondências prováveis ficam separadas para evitar duplicação silenciosa. Escolha como tratar conflitos exatos:</p><label><input type="checkbox" id="restore-import-trash" disabled={busy} /> Restaurar correspondências encontradas na Lixeira</label><div className="data-actions"><Button disabled={busy} onClick={() => void applyImportChoice('keep_current')}>Manter dados atuais</Button><Button variant="primary" disabled={busy} onClick={() => void applyImportChoice('use_imported')}>{busy ? 'Importando…' : 'Usar dados importados'}</Button></div></div></Dialog>
  </div>

  async function applyImportChoice(strategy: 'keep_current' | 'use_imported') {
    if (!importPreview || busy) return
    const restoreTrash = (document.getElementById('restore-import-trash') as HTMLInputElement | null)?.checked ?? false
    await dataAction(async () => {
      const result = await applyLibraryImport(window.auri.transfer.applyImport, { path: importPreview.path, strategy, restoreTrash }, refreshData)
      setImportPreview(null)
      if (result.skipped) showToast({ kind: 'info', message: `${result.skipped} correspondências prováveis ou itens da Lixeira não foram alterados.` })
    }, 'Importação concluída.')
  }
}

function SettingsHeading({ title, description }: { title: string; description: string }) {
  return <div className="settings-heading"><h2>{title}</h2><p>{description}</p></div>
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-group"><header><h3>{title}</h3><p>{description}</p></header>{children}</section>
}

function SettingsActionGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-action-group"><div><h3>{title}</h3><p>{description}</p></div><div className="data-actions">{children}</div></section>
}

function MaintenanceSettings({ diagnostics, cache, cacheLimitMb, loadError, busy, onBusy, reload, showToast }: {
  diagnostics: SystemDiagnostics | null
  cache: CoverCacheUsage | null
  cacheLimitMb: number
  loadError: boolean
  busy: boolean
  onBusy(value: boolean): void
  reload(): Promise<void>
  showToast(input: { kind: 'success' | 'error' | 'info'; message: string }): void
}) {
  const [clearCacheOpen, setClearCacheOpen] = useState(false)

  if (!diagnostics) return <><SettingsHeading title="Armazenamento e manutenção" description={`Consulte o uso local e mantenha o ${APP_BRAND.name} funcionando com segurança.`} />{loadError ? <ErrorState title="Não foi possível carregar o diagnóstico." description="A Biblioteca não foi alterada." onRetry={() => void reload().catch(() => undefined)} /> : <LoadingState />}</>

  const { status, storage, integrity } = diagnostics
  const run = async (action: () => Promise<unknown>, success: string, refresh = false) => {
    onBusy(true)
    try {
      await action()
      if (refresh) await reload()
      showToast({ kind: 'success', message: success })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' })
    } finally {
      onBusy(false)
    }
  }
  const clearCache = async () => {
    onBusy(true)
    try {
      await window.auri.system.clearCoverCache()
      window.dispatchEvent(new Event('auri:cover-cache-changed'))
      await reload()
      showToast({ kind: 'success', message: 'Cache de capas limpo.' })
      setClearCacheOpen(false)
    } finally {
      onBusy(false)
    }
  }

  return <>
    <SettingsHeading title="Armazenamento e manutenção" description={`Consulte o uso local e mantenha o ${APP_BRAND.name} funcionando com segurança.`} />

    <SettingsGroup title="Pastas do aplicativo" description={`Abra somente diretórios administrados pelo ${APP_BRAND.name}.`}>
      <SettingRow title="Dados do aplicativo" description={<span className="diagnostic-path" title={status.paths.root}>{status.paths.root}</span>}><Button disabled={busy} onClick={() => void run(() => window.auri.system.openDataFolder(), 'Pasta de dados aberta.')}>Abrir pasta</Button></SettingRow>
      <SettingRow title="Backups" description="Cópias completas criadas manual ou automaticamente."><Button disabled={busy} onClick={() => void run(() => window.auri.system.openBackupsFolder(), 'Pasta de backups aberta.')}>Abrir pasta</Button></SettingRow>
      <SettingRow title="Logs" description="Registros técnicos locais úteis para suporte."><Button disabled={busy} onClick={() => void run(() => window.auri.system.openLogsFolder(), 'Pasta de logs aberta.')}>Abrir pasta</Button></SettingRow>
    </SettingsGroup>

    <SettingsGroup title="Uso de armazenamento" description="Valores calculados ao abrir esta página; itens inexistentes aparecem como 0 B.">
      <SettingRow title="Banco de dados" description="Obras, progresso e demais informações permanentes."><span className="storage-value">{formatBytes(storage.databaseBytes)}</span></SettingRow>
      <SettingRow title="Capas personalizadas" description="Arquivos permanentes escolhidos por você."><span className="storage-value">{formatBytes(storage.customCoversBytes)}</span></SettingRow>
      <SettingRow title="Cache de capas" description={`${cache ? `${cache.files} arquivos · ${formatBytes(cache.bytes)} usados` : 'Arquivos temporários que podem ser recriados'} · limite de ${cacheLimitMb} MB.`}><span className="storage-value storage-value--cache">{formatBytes(storage.coverCacheBytes)}</span></SettingRow>
      <SettingRow title="Backups" description="Cópias permanentes mantidas na pasta configurada."><span className="storage-value">{formatBytes(storage.backupsBytes)}</span></SettingRow>
    </SettingsGroup>

    <SettingsGroup title="Manutenção segura" description="Estas ações não removem obras, progresso ou metadados.">
      <SettingRow title="Limpar cache de capas" description="Remove apenas arquivos temporários e regeneráveis. Capas personalizadas são preservadas."><Button variant="danger" disabled={busy} onClick={() => setClearCacheOpen(true)}>Limpar cache</Button></SettingRow>
      <SettingRow title="Verificar integridade da Biblioteca" description="Executa verificações somente de leitura; nenhuma correção automática é aplicada."><Button disabled={busy} onClick={() => void run(() => window.auri.system.checkIntegrity(), 'Verificação concluída.', true)}>Verificar integridade</Button></SettingRow>
      {integrity && <div className={`integrity-result ${integrity.healthy ? 'is-healthy' : 'has-issues'}`}><strong>{integrity.summary}</strong><p>Verificado em {new Date(integrity.checkedAt).toLocaleString('pt-BR')}.</p>{!integrity.healthy && <details><summary>Ver detalhes técnicos</summary><ul>{integrity.quickCheck.filter((item) => item !== 'ok').map((item, index) => <li key={`quick-${index}`}>{item}</li>)}{integrity.foreignKeyIssues.map((item, index) => <li key={`fk-${index}`}>Referência inválida em {item.table} → {item.parent} (FK {item.foreignKeyId})</li>)}</ul></details>}</div>}
    </SettingsGroup>

    <SettingsActionGroup title="Suporte e diagnóstico" description="Gere informações técnicas sem incluir o conteúdo pessoal da sua Biblioteca.">
      <Button disabled={busy} onClick={() => void run(() => window.auri.system.copySystemInfo(), 'Informações do sistema copiadas.')}>Copiar informações</Button>
      <Button disabled={busy} onClick={async () => { onBusy(true); try { const path = await window.auri.system.exportDiagnostic(); if (path) showToast({ kind: 'success', message: 'Diagnóstico exportado.' }) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível exportar o diagnóstico.' }) } finally { onBusy(false) } }}>Exportar diagnóstico</Button>
    </SettingsActionGroup>

    <ConfirmDialog open={clearCacheOpen} title="Limpar cache de capas?" description="Os arquivos temporários de capas serão removidos e recriados conforme necessário. Obras e capas personalizadas não serão alteradas." confirmLabel="Limpar cache" danger busy={busy} onClose={() => setClearCacheOpen(false)} onConfirm={clearCache} />
  </>
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function backupTypeLabel(type: BackupState['backups'][number]['type']): string {
  return ({ manual: 'Backup manual', auto: 'Backup automático', before_restore: 'Antes da restauração', before_import: 'Antes da importação', before_migration: 'Antes da migração' })[type]
}
