import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { BackupPreview, BackupState, CoverCacheUsage, ImportPreview, LibrarySort, LibraryView, SystemDiagnostics, SystemStatus } from '@shared/contracts'
import { useAppContext } from '../app/app-context'
import { SettingRow } from '../components/settings/SettingRow'
import { UpdatesSettings } from '../components/settings/UpdatesSettings'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Select } from '../components/ui/Select'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { applyLibraryImport } from '../lib/apply-library-import'

const sections = ['Aparência', 'Biblioteca', 'Backup', 'Atualizações', 'Atalhos', 'Avançado', 'Sobre'] as const
type Section = (typeof sections)[number]

const sortLabels: Record<LibrarySort, string> = {
  last_read_desc: 'Última leitura', last_read_asc: 'Mais tempo sem ler', title_asc: 'Título A–Z',
  title_desc: 'Título Z–A', created_desc: 'Adicionado recentemente', updated_desc: 'Atualizado recentemente',
  chapter_desc: 'Capítulo', rating_desc: 'Nota'
}

export function SettingsPage() {
  const { settings, updateSettings, refreshData } = useAppContext()
  const [section, setSection] = useState<Section>('Aparência')
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null)
  const [diagnosticError, setDiagnosticError] = useState(false)
  const [cache, setCache] = useState<CoverCacheUsage | null>(null)
  const [backup, setBackup] = useState<BackupState | null>(null)
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const loadCache = useCallback(() => void window.lumi.covers.usage().then(setCache).catch(() => setCache(null)), [])
  const loadDiagnostics = async () => {
    const next = await window.lumi.system.getDiagnostics()
    setDiagnostics(next)
    setSystem(next.status)
    setDiagnosticError(false)
  }
  useEffect(() => { void window.lumi.system.getStatus().then(setSystem); loadCache() }, [loadCache])
  useEffect(() => { const refresh = () => loadCache(); window.addEventListener('lumi:cover-cache-changed', refresh); return () => window.removeEventListener('lumi:cover-cache-changed', refresh) }, [loadCache])
  useEffect(() => { if (section === 'Biblioteca') loadCache() }, [loadCache, section])
  useEffect(() => { if (section === 'Backup') void window.lumi.backup.state().then(setBackup).catch((error) => showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar os backups.' })) }, [section, settings, showToast])
  useEffect(() => { if (section === 'Avançado') void loadDiagnostics().catch(() => { setDiagnostics(null); setDiagnosticError(true) }) }, [section])

  const dataAction = async (action: () => Promise<boolean | void>, success: string) => {
    setBusy(true)
    try {
      const completed = await action()
      if (completed === false) return
      setBackup(await window.lumi.backup.state())
      showToast({ kind: 'success', message: success })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' })
    } finally {
      setBusy(false)
    }
  }

  return <div className="page settings-page">
    <header className="page-header"><div><span className="page-kicker">Preferências do aplicativo</span><h1>Configurações</h1></div></header>
    <div className="settings-layout">
      <nav aria-label="Seções de Configurações">
        {sections.map((item) => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'is-active' : ''} onClick={() => setSection(item)}>{item}</button>)}
      </nav>
      <section className="settings-panel">
        {section === 'Aparência' && <>
          <SettingsHeading title="Aparência" description="Ajuste a densidade visual da sua Biblioteca." />
          <SettingRow title="Tamanho dos cards" description="Define quantas obras cabem por linha na visualização em grade.">
            <div className="size-segmented" role="group" aria-label="Tamanho dos cards">{([['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande']] as const).map(([cardSize, label]) => <button key={cardSize} className={settings.cardSize === cardSize ? 'is-active' : ''} aria-pressed={settings.cardSize === cardSize} onClick={() => void updateSettings({ cardSize })}>{label}</button>)}</div>
          </SettingRow>
        </>}

        {section === 'Biblioteca' && <>
          <SettingsHeading title="Biblioteca" description="Escolha como a coleção aparece ao ser aberta." />
          <SettingRow title="Visualização padrão" description="Modo usado ao abrir a Biblioteca.">
            <Select label="Visualização padrão" value={settings.libraryView} onChange={(libraryView) => void updateSettings({ libraryView: libraryView as LibraryView })} options={[{ value: 'grid', label: 'Grade' }, { value: 'list', label: 'Lista' }]} />
          </SettingRow>
          <SettingRow title="Ordenação padrão" description="Filtros temporários não são persistidos.">
            <Select label="Ordenação padrão" value={settings.librarySort} onChange={(librarySort) => void updateSettings({ librarySort: librarySort as LibrarySort })} options={Object.entries(sortLabels).map(([value, label]) => ({ value, label }))} />
          </SettingRow>
          <SettingRow title="Cache de capas" description={`${cache ? `${cache.files} arquivos · ${formatBytes(cache.bytes)} usados` : 'Calculando uso…'} · limite de ${settings.coverCacheMaxMb} MB.`}>
            <Button onClick={() => setSection('Avançado')}>Abrir manutenção</Button>
          </SettingRow>
        </>}

        {section === 'Backup' && <>
          <SettingsHeading title="Backup e portabilidade" description="Proteja uma instalação completa ou mova os dados da Biblioteca entre aplicativos." />
          <SettingsGroup title="Backup automático" description="Recuperação completa do Lumi, incluindo banco, preferências e arquivos permanentes.">
            <SettingRow title="Backup automático" description="Cria cópias de segurança sem incluir caches temporários.">
              <label className="setting-toggle"><input type="checkbox" checked={settings.backupAutomatic} onChange={(event) => void updateSettings({ backupAutomatic: event.target.checked })} /><span>Ativado</span></label>
            </SettingRow>
            <SettingRow title="Frequência" description="Intervalo entre os backups automáticos.">
              <Select label="Frequência" value={settings.backupFrequency} onChange={(backupFrequency) => void updateSettings({ backupFrequency: backupFrequency as 'daily' | 'weekly' })} options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal' }]} />
            </SettingRow>
            <SettingRow title="Retenção" description="Quantidade máxima de backups automáticos mantidos.">
              <Select label="Retenção" value={String(settings.backupRetention)} onChange={(backupRetention) => void updateSettings({ backupRetention: Number(backupRetention) })} options={[5, 10, 20, 30].map((value) => ({ value: String(value), label: `${value} backups` }))} />
            </SettingRow>
            <SettingRow title="Pasta dos backups" description={<span className={!backup?.directoryAvailable ? 'setting-warning' : ''}>{backup?.directory ?? 'Carregando…'}{backup && !backup.directoryAvailable ? ' · pasta indisponível; será usada a pasta padrão.' : ''}</span>}>
              <div className="setting-inline"><Button disabled={busy} onClick={() => void dataAction(() => window.lumi.backup.openFolder(), 'Pasta de backups aberta.')}>Abrir pasta</Button><Button disabled={busy} onClick={() => void dataAction(async () => { const state = await window.lumi.backup.chooseDirectory(); if (!state) return false; setBackup(state) }, 'Pasta de backups atualizada.')}>Alterar</Button></div>
            </SettingRow>
          </SettingsGroup>

          <SettingsActionGroup title="Backup" description="Crie uma cópia agora ou restaure o Lumi a partir de um backup completo.">
            <Button variant="primary" disabled={busy} onClick={() => void dataAction(async () => { await window.lumi.backup.create() }, 'Backup criado com sucesso.')}>Fazer backup agora</Button>
            <Button disabled={busy} onClick={() => void dataAction(async () => { const preview = await window.lumi.backup.chooseRestore(); if (!preview) return false; setRestorePreview(preview); return false }, '')}>Restaurar backup</Button>
          </SettingsActionGroup>

          <SettingsActionGroup title="Portabilidade" description="Exporte dados portáveis ou mescle outra biblioteca JSON com a atual.">
            <Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.lumi.transfer.exportJson()), 'Biblioteca exportada em JSON.')}>Exportar JSON</Button>
            <Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.lumi.transfer.exportCsv()), 'Resumo exportado em CSV.')}>Exportar CSV</Button>
            <Button disabled={busy} onClick={async () => { try { const preview = await window.lumi.transfer.chooseImport(); if (preview) setImportPreview(preview) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Arquivo de importação inválido.' }) } }}>Importar JSON</Button>
          </SettingsActionGroup>

          <div className="backup-list"><h3>Backups disponíveis</h3>{backup?.backups.length ? backup.backups.map((item) => <article key={item.path}><div><strong>{backupTypeLabel(item.type)}</strong><p>{new Date(item.createdAt).toLocaleString('pt-BR')} · {formatBytes(item.size)}</p></div><Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`Excluir ${item.fileName}?`)) void dataAction(async () => window.lumi.backup.delete({ path: item.path }), 'Backup excluído.') }}>Excluir</Button></article>) : <p className="muted-copy">Nenhum backup criado nesta pasta.</p>}</div>
        </>}

        {section === 'Atualizações' && <UpdatesSettings />}
        {section === 'Atalhos' && <><SettingsHeading title="Atalhos" description="Comandos de teclado para navegar e editar com mais rapidez." /><dl className="shortcut-list"><div><dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Abrir a busca rápida da Biblioteca</dd></div><div><dt><kbd>Ctrl</kbd> + <kbd>N</kbd></dt><dd>Adicionar uma nova obra</dd></div><div><dt><kbd>/</kbd></dt><dd>Focar a pesquisa da página atual</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Fechar o elemento atual ou sair da seleção</dd></div><div><dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>Salvar o formulário em edição</dd></div></dl></>}
        {section === 'Avançado' && <AdvancedSettings diagnostics={diagnostics} loadError={diagnosticError} busy={busy} onBusy={setBusy} reload={loadDiagnostics} showToast={showToast} />}
        {section === 'Sobre' && <><SettingsHeading title="Sobre" description="Informações desta instalação do Lumi." /><div className="about-brand"><div className="brand-mark brand-mark--large">L</div><div><strong>Lumi</strong><p>Sua biblioteca pessoal, preservada localmente.</p></div></div>{system && <dl className="about-details"><div><dt>Versão do app</dt><dd>{system.appVersion}</dd></div><div><dt>Database schema</dt><dd>{system.database.schemaVersion}</dd></div></dl>}</>}
      </section>
    </div>

    <Dialog open={!!restorePreview} title="Confirmar restauração" description={restorePreview ? `Backup de ${new Date(restorePreview.createdAt).toLocaleString('pt-BR')}, com ${restorePreview.workCount} obras. O Lumi criará um backup de segurança e reiniciará após restaurar.` : ''} onClose={() => setRestorePreview(null)} footer={<><Button onClick={() => setRestorePreview(null)}>Cancelar</Button><Button variant="danger" disabled={busy} onClick={() => void dataAction(async () => { await window.lumi.backup.restore({ path: restorePreview!.path }); setRestorePreview(null) }, 'Backup restaurado. O Lumi será reiniciado.')}>Restaurar e reiniciar</Button></>} />
    <Dialog open={!!importPreview} title="Revisar importação" description={importPreview ? `${importPreview.total} obras: ${importPreview.newWorks} novas, ${importPreview.exactMatches} correspondências exatas, ${importPreview.probableMatches} prováveis, ${importPreview.trashMatches} na Lixeira e ${importPreview.conflicts} conflitos.` : ''} onClose={() => setImportPreview(null)}><div className="import-preview"><p>Correspondências prováveis ficam separadas para evitar duplicação silenciosa. Escolha como tratar conflitos exatos:</p><label><input type="checkbox" id="restore-import-trash" /> Restaurar correspondências encontradas na Lixeira</label><div className="data-actions"><Button disabled={busy} onClick={() => void applyImportChoice('keep_current')}>Manter dados atuais</Button><Button variant="primary" disabled={busy} onClick={() => void applyImportChoice('use_imported')}>Usar dados importados</Button></div></div></Dialog>
  </div>

  async function applyImportChoice(strategy: 'keep_current' | 'use_imported') {
    if (!importPreview) return
    const restoreTrash = (document.getElementById('restore-import-trash') as HTMLInputElement | null)?.checked ?? false
    await dataAction(async () => {
      const result = await applyLibraryImport(window.lumi.transfer.applyImport, { path: importPreview.path, strategy, restoreTrash }, refreshData)
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

function AdvancedSettings({ diagnostics, loadError, busy, onBusy, reload, showToast }: {
  diagnostics: SystemDiagnostics | null
  loadError: boolean
  busy: boolean
  onBusy(value: boolean): void
  reload(): Promise<void>
  showToast(input: { kind: 'success' | 'error' | 'info'; message: string }): void
}) {
  if (!diagnostics) return <><SettingsHeading title="Diagnóstico e manutenção" description="Informações locais e operações seguras para manter o Lumi funcionando." />{loadError ? <ErrorState title="Não foi possível carregar o diagnóstico." description="A Biblioteca não foi alterada." onRetry={() => void reload().catch(() => undefined)} /> : <LoadingState />}</>
  const { status, storage, integrity } = diagnostics
  const run = async (action: () => Promise<unknown>, success: string, refresh = false) => {
    onBusy(true)
    try {
      await action()
      if (refresh) await reload()
      showToast({ kind: 'success', message: success })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível concluir a operação.' })
    } finally { onBusy(false) }
  }

  return <>
    <SettingsHeading title="Diagnóstico e manutenção" description="Informações locais e operações seguras para manter o Lumi funcionando." />
    <SettingsGroup title="Informações do aplicativo" description="Versões reais desta instalação e dos formatos locais.">
      <div className="diagnostic-card"><dl>
        <div><dt>Aplicativo</dt><dd>Lumi {status.appVersion}</dd></div>
        <div><dt>Banco</dt><dd>Schema {status.database.schemaVersion}</dd></div>
        <div><dt>Formato de backup</dt><dd>{status.backupFormatVersion}</dd></div>
        <div><dt>Plataforma</dt><dd>{status.platform.label}</dd></div>
      </dl></div>
    </SettingsGroup>

    <SettingsGroup title="Pastas importantes" description="Abra somente os diretórios administrados pelo Lumi.">
      <SettingRow title="Dados do aplicativo" description={<span className="diagnostic-path" title={status.paths.root}>{status.paths.root}</span>}><Button disabled={busy} onClick={() => void run(() => window.lumi.system.openDataFolder(), 'Pasta de dados aberta.')}>Abrir pasta</Button></SettingRow>
      <SettingRow title="Backups" description="Cópias completas criadas manual ou automaticamente."><Button disabled={busy} onClick={() => void run(() => window.lumi.system.openBackupsFolder(), 'Pasta de backups aberta.')}>Abrir pasta</Button></SettingRow>
      <SettingRow title="Logs" description="Registros técnicos locais úteis para suporte."><Button disabled={busy} onClick={() => void run(() => window.lumi.system.openLogsFolder(), 'Pasta de logs aberta.')}>Abrir pasta</Button></SettingRow>
    </SettingsGroup>

    <SettingsGroup title="Armazenamento" description="Valores calculados ao carregar esta seção; itens inexistentes aparecem como 0 B.">
      <SettingRow title="Banco" description="Dados permanentes da Biblioteca."><span className="storage-value">{formatBytes(storage.databaseBytes)}</span></SettingRow>
      <SettingRow title="Capas personalizadas" description="Arquivos permanentes escolhidos por você."><span className="storage-value">{formatBytes(storage.customCoversBytes)}</span></SettingRow>
      <SettingRow title="Cache de capas" description="Arquivos descartáveis que podem ser reconstruídos."><span className="storage-value storage-value--cache">{formatBytes(storage.coverCacheBytes)}</span></SettingRow>
      <SettingRow title="Backups" description="Cópias permanentes mantidas na pasta configurada."><span className="storage-value">{formatBytes(storage.backupsBytes)}</span></SettingRow>
    </SettingsGroup>

    <SettingsGroup title="Manutenção segura" description="Estas ações não modificam obras, progresso ou metadados.">
      <SettingRow title="Limpar cache de capas" description="Remove somente arquivos regeneráveis ou baixados. Obras e capas personalizadas são preservadas."><Button disabled={busy} onClick={() => void run(async () => { await window.lumi.system.clearCoverCache(); window.dispatchEvent(new Event('lumi:cover-cache-changed')) }, 'Cache de capas limpo.', true)}>Limpar cache</Button></SettingRow>
      <SettingRow title="Verificar integridade da biblioteca" description="Executa verificações SQLite somente de leitura; nenhuma correção automática é aplicada."><Button disabled={busy} onClick={() => void run(() => window.lumi.system.checkIntegrity(), 'Verificação concluída.', true)}>Verificar integridade</Button></SettingRow>
      {integrity && <div className={`integrity-result ${integrity.healthy ? 'is-healthy' : 'has-issues'}`}><strong>{integrity.summary}</strong><p>Verificado em {new Date(integrity.checkedAt).toLocaleString('pt-BR')}.</p>{!integrity.healthy && <details><summary>Ver detalhes técnicos</summary><ul>{integrity.quickCheck.filter((item) => item !== 'ok').map((item, index) => <li key={`quick-${index}`}>{item}</li>)}{integrity.foreignKeyIssues.map((item, index) => <li key={`fk-${index}`}>Referência inválida em {item.table} → {item.parent} (FK {item.foreignKeyId})</li>)}</ul></details>}</div>}
    </SettingsGroup>

    <SettingsActionGroup title="Suporte" description="Gere informações técnicas sem incluir dados pessoais da sua Biblioteca.">
      <Button disabled={busy} onClick={() => void run(() => window.lumi.system.copySystemInfo(), 'Informações do sistema copiadas.')}>Copiar informações do sistema</Button>
      <Button disabled={busy} onClick={async () => { onBusy(true); try { const path = await window.lumi.system.exportDiagnostic(); if (path) showToast({ kind: 'success', message: 'Diagnóstico exportado.' }) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível exportar o diagnóstico.' }) } finally { onBusy(false) } }}>Exportar diagnóstico</Button>
    </SettingsActionGroup>
  </>
}

function formatBytes(bytes: number): string { if (bytes === 0) return '0 B'; if (bytes < 1024) return `${bytes} B`; return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function backupTypeLabel(type: BackupState['backups'][number]['type']): string { return ({ manual: 'Backup manual', auto: 'Backup automático', before_restore: 'Antes da restauração', before_import: 'Antes da importação', before_migration: 'Antes da migração' })[type] }
