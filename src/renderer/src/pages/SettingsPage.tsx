import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { BackupPreview, BackupRecord, BackupState, CoverCacheUsage, ImportPreview, LibraryView, SystemDiagnostics, SystemStatus, Work } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { useAppContext } from '../app/app-context'
import { BrandMark } from '../components/shell/BrandMark'
import { SettingRow } from '../components/settings/SettingRow'
import { UpdatesSettings } from '../components/settings/UpdatesSettings'
import { Button } from '../components/ui/Button'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { Icon, type IconName } from '../components/ui/Icon'
import { KeyboardMenu } from '../components/ui/KeyboardMenu'
import { Select } from '../components/ui/Select'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/Toast'
import { applyLibraryImport } from '../lib/apply-library-import'

export const SETTINGS_SECTIONS = [
  { id: 'appearance', label: 'Aparência', icon: 'grid' },
  { id: 'library', label: 'Biblioteca e Home', icon: 'home' },
  { id: 'backup-data', label: 'Backup e dados', icon: 'library' },
  { id: 'updates', label: 'Atualizações', icon: 'rotate' },
  { id: 'shortcuts', label: 'Atalhos', icon: 'panel-left' },
  { id: 'maintenance', label: 'Manutenção', icon: 'settings' },
  { id: 'about', label: 'Sobre', icon: 'alert' }
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

export function adjacentSettingsSection(current: SettingsSection, key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'): SettingsSection {
  if (key === 'Home') return SETTINGS_SECTIONS[0].id
  if (key === 'End') return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id
  const index = SETTINGS_SECTIONS.findIndex((item) => item.id === current)
  const offset = key === 'ArrowDown' ? 1 : -1
  return SETTINGS_SECTIONS[(index + offset + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length].id
}

export function backupCountLabel(count: number): string {
  return count + (count === 1 ? ' backup armazenado' : ' backups armazenados')
}

export function formatBackupDate(value: string, now = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const previousDay = date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Hoje, ${time}`
  if (previousDay) return `Ontem, ${time}`
  return `${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}, ${time}`
}

export function backupWorkCountLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 0) return null
  return `${count} ${count === 1 ? 'obra' : 'obras'}`
}

export function formatBackupMetadata(backup: Pick<BackupRecord, 'size' | 'workCount'>): string {
  return [formatBytes(backup.size), backupWorkCountLabel(backup.workCount)].filter(Boolean).join(' • ')
}

export function cardPreviewCount(size: 'small' | 'medium' | 'large'): number {
  return ({ small: 5, medium: 4, large: 3 })[size]
}

export function SettingsPage() {
  const { settings, updateSettings, refreshData } = useAppContext()
  const [section, setSection] = useState<SettingsSection>('appearance')
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null)
  const [diagnosticError, setDiagnosticError] = useState(false)
  const [cache, setCache] = useState<CoverCacheUsage | null>(null)
  const [backup, setBackup] = useState<BackupState | null>(null)
  const [backupManagerOpen, setBackupManagerOpen] = useState(false)
  const [restorePreview, setRestorePreview] = useState<BackupPreview | BackupRecord | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [deleteBackup, setDeleteBackup] = useState<BackupRecord | null>(null)
  const [returnToBackupManager, setReturnToBackupManager] = useState(false)
  const [hiddenWorks, setHiddenWorks] = useState<Work[]>([])
  const [hiddenManagerOpen, setHiddenManagerOpen] = useState(false)
  const [hiddenLoading, setHiddenLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const { showToast, updateToast } = useToast()

  const loadHiddenWorks = useCallback(async () => {
    setHiddenLoading(true)
    try { setHiddenWorks(await window.auri.library.query({ hiddenFromHome: true, sort: 'title_asc' })) }
    finally { setHiddenLoading(false) }
  }, [])
  const loadCache = useCallback(() => void window.auri.covers.usage().then(setCache).catch(() => setCache(null)), [])
  const loadBackup = useCallback(() => void window.auri.backup.state().then(setBackup).catch((error) => showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar os backups.' })), [showToast])
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
    if (section === 'library') void loadHiddenWorks().catch(() => showToast({ kind: 'error', message: 'Não foi possível carregar as obras ocultas.' }))
  }, [loadHiddenWorks, section, showToast])
  useEffect(() => {
    if (section === 'backup-data' || section === 'maintenance') loadBackup()
  }, [loadBackup, section, settings])
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
    if (focus) window.requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>('[data-settings-section="' + next + '"]')?.focus())
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
    } finally { setBusy(false) }
  }

  const createBackup = async () => {
    if (busy) return
    const toastId = showToast({ kind: 'progress', message: 'Criando backup…', dedupeKey: 'backup-create' })
    setBusy(true)
    try {
      await window.auri.backup.create()
      setBackup(await window.auri.backup.state())
      updateToast(toastId, { kind: 'success', message: 'Backup criado' })
    } catch (error) {
      updateToast(toastId, { kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível criar o backup.' })
    } finally { setBusy(false) }
  }

  const confirmBackupDeletion = async () => {
    if (!deleteBackup) return
    await window.auri.backup.delete({ path: deleteBackup.path })
    setBackup(await window.auri.backup.state())
    showToast({ kind: 'success', message: 'Backup excluído', dedupeKey: 'backup-delete' })
    setDeleteBackup(null)
    if (returnToBackupManager) setBackupManagerOpen(true)
    setReturnToBackupManager(false)
  }

  const openStoredBackupAction = (item: BackupRecord, action: 'restore' | 'delete') => {
    setReturnToBackupManager(true)
    setBackupManagerOpen(false)
    if (action === 'restore') setRestorePreview(item)
    else setDeleteBackup(item)
  }

  const closeDeleteBackup = () => {
    setDeleteBackup(null)
    if (returnToBackupManager) setBackupManagerOpen(true)
    setReturnToBackupManager(false)
  }

  const closeRestoreBackup = () => {
    setRestorePreview(null)
    if (returnToBackupManager) setBackupManagerOpen(true)
    setReturnToBackupManager(false)
  }

  const chooseRestoreBackup = async () => {
    if (busy) return
    setBusy(true)
    try {
      const preview = await window.auri.backup.chooseRestore()
      if (preview) {
        setReturnToBackupManager(false)
        setRestorePreview(preview)
      }
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível abrir este backup.' })
    } finally { setBusy(false) }
  }

  const showOnHome = async (work: Work) => {
    setBusy(true)
    try {
      await window.auri.works.update({ id: work.id, hiddenFromHome: false })
      setHiddenWorks((current) => current.filter((item) => item.id !== work.id))
      refreshData()
      showToast({ kind: 'info', message: 'Obra visível na Home' })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível atualizar a obra.' })
    } finally { setBusy(false) }
  }

  const showAllOnHome = async () => {
    if (!hiddenWorks.length) return
    setBusy(true)
    try {
      await window.auri.bulk.setHomeVisibility({ workIds: hiddenWorks.map((work) => work.id), hiddenFromHome: false })
      setHiddenWorks([])
      refreshData()
      showToast({ kind: 'info', message: 'Todas as obras estão visíveis na Home' })
    } catch (error) {
      showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível atualizar as obras.' })
    } finally { setBusy(false) }
  }

  const confirmRestore = async () => {
    if (!restorePreview) return
    await window.auri.backup.restore({ path: restorePreview.path })
    setRestorePreview(null)
    setReturnToBackupManager(false)
  }

  return <div className="page settings-page">
    <div className="settings-layout">
      <nav ref={navRef} aria-label="Seções de Configurações" onKeyDown={handleNavigationKey}>
        <span className="settings-nav-label">Configurações</span>
        {SETTINGS_SECTIONS.map((item) => <button key={item.id} data-settings-section={item.id} aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? 'is-active' : ''} onClick={() => navigateSection(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
      </nav>
      <section ref={panelRef} className="settings-panel" aria-live="polite">
        {section === 'appearance' && <>
          <SettingsHeading title="Aparência" description="Personalize a apresentação visual do Auri." />
          <SettingsGroup title="Biblioteca">
            <div className="card-size-options" role="radiogroup" aria-label="Tamanho dos cards">
              {([['small', 'Pequeno', 'Mais obras por linha'], ['medium', 'Médio', 'Equilibrado'], ['large', 'Grande', 'Mais destaque para capas']] as const).map(([cardSize, label, description]) => <button key={cardSize} role="radio" aria-checked={settings.cardSize === cardSize} className={settings.cardSize === cardSize ? 'is-active' : ''} onClick={() => void updateSettings({ cardSize })}><span className={'card-size-icon card-size-icon--' + cardSize} aria-hidden="true">{Array.from({ length: cardSize === 'small' ? 6 : cardSize === 'medium' ? 4 : 1 }, (_, index) => <i key={index} />)}</span><strong>{label}</strong><small>{description}</small><span className="card-size-check" aria-hidden="true">✓</span></button>)}
            </div>
            <div className="card-size-preview" data-card-size={settings.cardSize} aria-label={'Prévia do tamanho ' + settings.cardSize}>
              <span>Prévia em tempo real</span>
              <div aria-hidden="true">{Array.from({ length: cardPreviewCount(settings.cardSize) }, (_, index) => <article key={index}><div /><i /></article>)}</div>
            </div>
          </SettingsGroup>
        </>}

        {section === 'library' && <>
          <SettingsHeading title="Biblioteca e Home" description="Defina como sua biblioteca é apresentada e controle o que aparece na Home." />
          <SettingsGroup title="Biblioteca">
            <SettingRow title="Visualização padrão" description="Escolha como a Biblioteca deve abrir.">
              <div className="view-choice" role="group" aria-label="Visualização padrão"><button aria-pressed={settings.libraryView === 'grid'} className={settings.libraryView === 'grid' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'grid' })}><Icon name="grid" />Grade</button><button aria-pressed={settings.libraryView === 'list'} className={settings.libraryView === 'list' ? 'is-active' : ''} onClick={() => void updateSettings({ libraryView: 'list' })}><Icon name="list" />Lista</button></div>
            </SettingRow>
            <p className="settings-info-note">O Auri lembra automaticamente a última ordenação usada na Biblioteca.</p>
          </SettingsGroup>
          <SettingsGroup title="Home">
            <SettingRow title="Obras ocultas da Home" description="Obras ocultas deixam de aparecer nas seções da Home, mas continuam normalmente disponíveis na Biblioteca.">
              <div className="setting-inline"><span className="settings-count">{hiddenWorks.length} {hiddenWorks.length === 1 ? 'obra oculta' : 'obras ocultas'}</span><Button onClick={() => { setHiddenManagerOpen(true); void loadHiddenWorks() }}>Gerenciar</Button></div>
            </SettingRow>
          </SettingsGroup>
        </>}

        {section === 'backup-data' && <>
          <SettingsHeading title="Backup e dados" description="Proteja sua biblioteca, restaure dados e mova sua instalação com segurança." />
          <SettingsGroup title="Backup manual">
            <SettingRow title="Criar backup" description="Cria uma cópia completa do banco, preferências e arquivos permanentes."><Button variant="primary" disabled={busy} onClick={() => void createBackup()}>Criar backup</Button></SettingRow>
          </SettingsGroup>
          <SettingsGroup title="Backups automáticos">
            <SettingRow title="Criar automaticamente" description="Mantém cópias recentes sem exigir uma ação manual."><label className="setting-toggle"><input type="checkbox" checked={settings.backupAutomatic} onChange={(event) => void updateSettings({ backupAutomatic: event.target.checked })} /><span>{settings.backupAutomatic ? 'Ativado' : 'Desativado'}</span></label></SettingRow>
            <SettingRow title="Frequência" description="Intervalo entre os backups automáticos."><Select label="Frequência" value={settings.backupFrequency} onChange={(backupFrequency) => void updateSettings({ backupFrequency: backupFrequency as 'daily' | 'weekly' })} options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal' }]} /></SettingRow>
            <SettingRow title="Manter os últimos" description="Quantidade máxima de backups automáticos mantidos."><Select label="Manter os últimos" value={String(settings.backupRetention)} onChange={(backupRetention) => void updateSettings({ backupRetention: Number(backupRetention) })} options={[5, 10, 20, 30].map((value) => ({ value: String(value), label: value + ' backups' }))} /></SettingRow>
          </SettingsGroup>
          <SettingsGroup title="Local dos backups">
            <SettingRow title="Pasta atual" description={<span className={!backup?.directoryAvailable ? 'setting-warning diagnostic-path' : 'diagnostic-path'} title={backup?.directory}>{backup?.directory ?? 'Carregando…'}{backup && !backup.directoryAvailable ? ' · Pasta indisponível; o Auri usará a pasta padrão.' : ''}</span>}><div className="setting-inline"><Button disabled={busy} onClick={() => void dataAction(() => window.auri.backup.openFolder(), 'Pasta de backups aberta.')}>Abrir pasta</Button><Button disabled={busy} onClick={() => void dataAction(async () => { const state = await window.auri.backup.chooseDirectory(); if (!state) return false; setBackup(state) }, 'Pasta de backups atualizada.')}>Alterar</Button></div></SettingRow>
          </SettingsGroup>
          <SettingsGroup title="Restaurar e transferir dados">
            <SettingRow title="Restaurar backup" description="Substitui os dados atuais por uma cópia completa validada."><Button disabled={busy} onClick={() => void chooseRestoreBackup()}>Escolher backup</Button></SettingRow>
            <SettingRow title="Exportar biblioteca" description="Exporta sua biblioteca completa para um arquivo JSON."><Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.auri.transfer.exportJson()), 'Biblioteca exportada em JSON.')}>Exportar JSON</Button></SettingRow>
            <SettingRow title="Exportar resumo" description="Cria um resumo da biblioteca em formato CSV."><Button disabled={busy} onClick={() => void dataAction(async () => Boolean(await window.auri.transfer.exportCsv()), 'Resumo exportado em CSV.')}>Exportar CSV</Button></SettingRow>
            <SettingRow title="Importar biblioteca" description="Importa uma biblioteca anteriormente exportada em JSON."><Button disabled={busy} onClick={async () => { try { const preview = await window.auri.transfer.chooseImport(); if (preview) setImportPreview(preview) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Arquivo de importação inválido.' }) } }}>Importar</Button></SettingRow>
          </SettingsGroup>
          <SettingsGroup title="Backups disponíveis">
            <SettingRow title={backupCountLabel(backup?.backups.length ?? 0)} description="Consulte, restaure ou exclua as cópias armazenadas na pasta configurada."><Button disabled={!backup?.backups.length} onClick={() => setBackupManagerOpen(true)}>Gerenciar backups</Button></SettingRow>
          </SettingsGroup>
        </>}

        {section === 'updates' && <UpdatesSettings />}

        {section === 'shortcuts' && <>
          <SettingsHeading title="Atalhos" description="Consulte os comandos de teclado disponíveis no Auri." />
          <SettingsGroup title="Atalhos disponíveis">
            <dl className="shortcut-list"><Shortcut keys={['Ctrl', 'K']} description="Abrir a busca rápida da Biblioteca" /><Shortcut keys={['Ctrl', 'N']} description="Adicionar uma nova obra" /><Shortcut keys={['/']} description="Focar a pesquisa da página atual" /><Shortcut keys={['Ctrl', 'S']} description="Salvar alterações ou formulário em edição" /><Shortcut keys={['Esc']} description="Fechar o elemento atual ou sair da seleção" /></dl>
          </SettingsGroup>
        </>}

        {section === 'maintenance' && <MaintenanceSettings diagnostics={diagnostics} cache={cache} cacheLimitMb={settings.coverCacheMaxMb} backupDirectory={backup?.directory} loadError={diagnosticError} busy={busy} onBusy={setBusy} reload={loadDiagnostics} showToast={showToast} />}

        {section === 'about' && <>
          <SettingsHeading title="Sobre" description="Informações sobre o Auri e esta instalação." />
          <SettingsGroup title="Auri">
            <div className="about-brand"><BrandMark large /><div><strong>{APP_BRAND.name}</strong><p>{APP_BRAND.tagline}</p><span>Versão {system?.appVersion ?? '—'}</span></div></div>
          </SettingsGroup>
          <SettingsGroup title="Esta instalação">
            {system ? <dl className="settings-info-list"><div><dt>Versão do aplicativo</dt><dd>{system.appVersion}</dd></div><div><dt>Banco de dados</dt><dd>Schema {system.database.schemaVersion}</dd></div><div><dt>Formato de backup</dt><dd>Versão {system.backupFormatVersion}</dd></div><div><dt>Plataforma</dt><dd>{system.platform.label}</dd></div></dl> : <LoadingState />}
          </SettingsGroup>
        </>}
      </section>
    </div>

    <Dialog open={backupManagerOpen} title="Gerenciar backups" description={backupCountLabel(backup?.backups.length ?? 0)} size="large" busy={busy} onClose={() => { if (!busy) setBackupManagerOpen(false) }} footer={<Button disabled={busy} onClick={() => setBackupManagerOpen(false)}>Fechar</Button>}>
      <div className="backup-manager-list">{backup?.backups.length ? backup.backups.map((item) => <article key={item.path}>
        <div className="backup-manager-item__copy">
          <div className="backup-manager-item__heading"><strong>{backupTypeLabel(item.type)}</strong><time dateTime={item.createdAt}>{formatBackupDate(item.createdAt)}</time></div>
          {backupTypeDescription(item.type) && <p className="backup-manager-item__description">{backupTypeDescription(item.type)}</p>}
          <p className="backup-manager-item__metadata">{formatBackupMetadata(item)}</p>
        </div>
        <div className="backup-manager-item__actions">
          <Button variant="primary" disabled={busy} onClick={() => openStoredBackupAction(item, 'restore')}>Restaurar</Button>
          <KeyboardMenu className="backup-item-menu" label={`Mais ações para ${backupTypeLabel(item.type)}`}><button disabled={busy} onClick={() => void dataAction(() => window.auri.backup.openFolder(), 'Pasta de backups aberta.')}>Abrir pasta de backups</button><button className="is-danger" disabled={busy} onClick={() => openStoredBackupAction(item, 'delete')}>Excluir backup</button></KeyboardMenu>
        </div>
      </article>) : <p className="muted-copy">Nenhum backup criado nesta pasta.</p>}</div>
    </Dialog>
    <Dialog open={hiddenManagerOpen} title="Obras ocultas da Home" description="Restaure apenas a presença nas seções automáticas da Home; nenhum outro dado será alterado." busy={busy} onClose={() => { if (!busy) setHiddenManagerOpen(false) }} footer={<><Button disabled={busy} onClick={() => setHiddenManagerOpen(false)}>Fechar</Button>{hiddenWorks.length > 1 && <Button variant="primary" disabled={busy} onClick={() => void showAllOnHome()}>Mostrar todas na Home</Button>}</>}>
      <div className="hidden-home-list">{hiddenLoading && <p className="muted-copy">Carregando obras ocultas…</p>}{!hiddenLoading && hiddenWorks.length === 0 && <p className="muted-copy">Nenhuma obra está oculta da Home.</p>}{!hiddenLoading && hiddenWorks.map((work) => <article key={work.id}><div><strong title={work.title}>{work.title}</strong><span>{work.userStatus.replaceAll('_', ' ')}</span></div><Button disabled={busy} onClick={() => void showOnHome(work)}>Mostrar na Home</Button></article>)}</div>
    </Dialog>
    <ConfirmDialog open={!!deleteBackup} title="Excluir este backup?" context={deleteBackup ? <BackupDialogContext backup={deleteBackup} /> : undefined} description="Este backup será excluído permanentemente. Sua biblioteca atual não será alterada." confirmLabel="Excluir backup" danger onClose={closeDeleteBackup} onConfirm={confirmBackupDeletion} />
    <ConfirmDialog open={!!restorePreview} title="Restaurar este backup?" context={restorePreview ? <BackupDialogContext backup={restorePreview} /> : undefined} description={`Sua biblioteca atual será substituída pelos dados deste backup. Antes disso, o ${APP_BRAND.name} criará uma cópia de segurança do estado atual. O aplicativo será reiniciado ao concluir.`} confirmLabel="Restaurar" onClose={closeRestoreBackup} onConfirm={confirmRestore} />
    <Dialog open={!!importPreview} title="Revisar importação" description={importPreview ? importPreview.total + ' obras: ' + importPreview.newWorks + ' novas, ' + importPreview.exactMatches + ' correspondências exatas, ' + importPreview.probableMatches + ' prováveis, ' + importPreview.trashMatches + ' na Lixeira e ' + importPreview.conflicts + ' conflitos.' : ''} busy={busy} onClose={() => { if (!busy) setImportPreview(null) }}><div className="import-preview"><p>Correspondências prováveis ficam separadas para evitar duplicação silenciosa. Escolha como tratar conflitos exatos:</p><label><input type="checkbox" id="restore-import-trash" disabled={busy} /> Restaurar correspondências encontradas na Lixeira</label><div className="data-actions"><Button disabled={busy} onClick={() => void applyImportChoice('keep_current')}>Manter dados atuais</Button><Button variant="primary" disabled={busy} onClick={() => void applyImportChoice('use_imported')}>{busy ? 'Importando…' : 'Usar dados importados'}</Button></div></div></Dialog>
  </div>

  async function applyImportChoice(strategy: 'keep_current' | 'use_imported') {
    if (!importPreview || busy) return
    const restoreTrash = (document.getElementById('restore-import-trash') as HTMLInputElement | null)?.checked ?? false
    await dataAction(async () => {
      const result = await applyLibraryImport(window.auri.transfer.applyImport, { path: importPreview.path, strategy, restoreTrash }, refreshData)
      setImportPreview(null)
      if (result.skipped) showToast({ kind: 'info', message: result.skipped + ' correspondências prováveis ou itens da Lixeira não foram alterados.' })
    }, 'Importação concluída.')
  }
}

function SettingsHeading({ title, description }: { title: string; description: string }) {
  return <div className="settings-heading"><h2>{title}</h2><p>{description}</p></div>
}

function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="settings-group"><header><h3>{title}</h3>{description && <p>{description}</p>}</header><div className="settings-group__body">{children}</div></section>
}

function Shortcut({ keys, description }: { keys: string[]; description: string }) {
  return <div><dt>{keys.map((key, index) => <span key={key + '-' + index}>{index > 0 && <i aria-hidden="true">+</i>}<kbd>{key}</kbd></span>)}</dt><dd>{description}</dd></div>
}

function MaintenanceSettings({ diagnostics, cache, cacheLimitMb, backupDirectory, loadError, busy, onBusy, reload, showToast }: {
  diagnostics: SystemDiagnostics | null
  cache: CoverCacheUsage | null
  cacheLimitMb: number
  backupDirectory?: string
  loadError: boolean
  busy: boolean
  onBusy(value: boolean): void
  reload(): Promise<void>
  showToast(input: { kind: 'success' | 'error' | 'info'; message: string }): void
}) {
  const [clearCacheOpen, setClearCacheOpen] = useState(false)

  if (!diagnostics) return <><SettingsHeading title="Manutenção" description="Ferramentas para verificar, limpar e diagnosticar o Auri." />{loadError ? <ErrorState title="Não foi possível carregar o diagnóstico." description="A Biblioteca não foi alterada." onRetry={() => void reload().catch(() => undefined)} /> : <LoadingState />}</>

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
  const clearCache = async () => {
    onBusy(true)
    try {
      await window.auri.system.clearCoverCache()
      window.dispatchEvent(new Event('auri:cover-cache-changed'))
      await reload()
      showToast({ kind: 'success', message: 'Cache de capas limpo.' })
      setClearCacheOpen(false)
    } finally { onBusy(false) }
  }

  return <>
    <SettingsHeading title="Manutenção" description="Ferramentas para verificar, limpar e diagnosticar o Auri." />
    <SettingsGroup title="Pastas do Auri">
      <SettingRow title="Dados do aplicativo" description={<span className="diagnostic-path" title={status.paths.root}>{status.paths.root}</span>}><Button disabled={busy} onClick={() => void run(() => window.auri.system.openDataFolder(), 'Pasta de dados aberta.')}>Abrir</Button></SettingRow>
      <SettingRow title="Backups" description={<span className="diagnostic-path" title={backupDirectory ?? status.paths.backups}>{backupDirectory ?? status.paths.backups}</span>}><Button disabled={busy} onClick={() => void run(() => window.auri.system.openBackupsFolder(), 'Pasta de backups aberta.')}>Abrir</Button></SettingRow>
      <SettingRow title="Logs" description={<span className="diagnostic-path" title={status.paths.logs}>{status.paths.logs}</span>}><Button disabled={busy} onClick={() => void run(() => window.auri.system.openLogsFolder(), 'Pasta de logs aberta.')}>Abrir</Button></SettingRow>
    </SettingsGroup>
    <SettingsGroup title="Armazenamento">
      <dl className="settings-info-list"><div><dt>Banco de dados</dt><dd>{formatBytes(storage.databaseBytes)}</dd></div><div><dt>Capas personalizadas</dt><dd>{formatBytes(storage.customCoversBytes)}</dd></div><div><dt>Cache de capas</dt><dd>{cache ? formatBytes(cache.bytes) + ' / ' + cacheLimitMb + ' MB' : formatBytes(storage.coverCacheBytes)}</dd></div><div><dt>Backups</dt><dd>{formatBytes(storage.backupsBytes)}</dd></div></dl>
    </SettingsGroup>
    <SettingsGroup title="Manutenção segura">
      <SettingRow title="Limpar cache de capas" description="Remove apenas arquivos temporários e regeneráveis. Capas personalizadas são preservadas."><Button disabled={busy} onClick={() => setClearCacheOpen(true)}>Limpar cache</Button></SettingRow>
      <SettingRow title="Verificar integridade da Biblioteca" description="Executa verificações somente de leitura; nenhuma correção automática é aplicada."><Button disabled={busy} onClick={() => void run(() => window.auri.system.checkIntegrity(), 'Verificação concluída.', true)}>Verificar integridade</Button></SettingRow>
      {integrity && <div className={'integrity-result ' + (integrity.healthy ? 'is-healthy' : 'has-issues')}><strong>{integrity.summary}</strong><p>{formatIntegrityCheckedAt(integrity.checkedAt)}</p>{!integrity.healthy && <details><summary>Ver detalhes técnicos</summary><ul>{integrity.quickCheck.filter((item) => item !== 'ok').map((item, index) => <li key={'quick-' + index}>{item}</li>)}{integrity.foreignKeyIssues.map((item, index) => <li key={'fk-' + index}>Referência inválida em {item.table} → {item.parent} (FK {item.foreignKeyId})</li>)}</ul></details>}</div>}
    </SettingsGroup>
    <SettingsGroup title="Suporte e diagnóstico">
      <SettingRow title="Informações técnicas" description="Copia detalhes do ambiente e da instalação sem incluir sua Biblioteca."><Button disabled={busy} onClick={() => void run(() => window.auri.system.copySystemInfo(), 'Informações do sistema copiadas.')}>Copiar informações</Button></SettingRow>
      <SettingRow title="Diagnóstico" description="Gera um relatório sanitizado para suporte."><Button disabled={busy} onClick={async () => { onBusy(true); try { const path = await window.auri.system.exportDiagnostic(); if (path) showToast({ kind: 'success', message: 'Diagnóstico exportado.' }) } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível exportar o diagnóstico.' }) } finally { onBusy(false) } }}>Exportar diagnóstico</Button></SettingRow>
    </SettingsGroup>
    <ConfirmDialog open={clearCacheOpen} title="Limpar cache de capas?" description="Os arquivos temporários de capas serão removidos e recriados conforme necessário. Obras e capas personalizadas não serão alteradas." confirmLabel="Limpar cache" busy={busy} onClose={() => setClearCacheOpen(false)} onConfirm={clearCache} />
  </>
}

export function formatIntegrityCheckedAt(value: string, now = new Date()): string {
  const checkedAt = new Date(value)
  const sameDay = checkedAt.getFullYear() === now.getFullYear() && checkedAt.getMonth() === now.getMonth() && checkedAt.getDate() === now.getDate()
  const date = sameDay ? 'hoje' : checkedAt.toLocaleDateString('pt-BR')
  return 'Verificado ' + date + ' às ' + checkedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  return bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export function backupTypeLabel(type: BackupState['backups'][number]['type']): string {
  return ({ manual: 'Backup manual', auto: 'Backup automático', before_restore: 'Antes da restauração', before_import: 'Antes da importação', before_migration: 'Antes da migração' })[type]
}

function backupTypeDescription(type: BackupState['backups'][number]['type']): string | null {
  return ({
    manual: null,
    auto: null,
    before_restore: 'Criado automaticamente para proteger sua biblioteca antes de uma restauração.',
    before_import: 'Criado automaticamente antes de importar dados para a biblioteca.',
    before_migration: 'Criado automaticamente antes de atualizar a estrutura dos dados.'
  })[type]
}

function BackupDialogContext({ backup }: { backup: BackupRecord | BackupPreview }) {
  return <div className="backup-dialog-context"><strong>{backupTypeLabel(backup.type)}</strong><time dateTime={backup.createdAt}>{formatBackupDate(backup.createdAt)}</time><span>{formatBackupMetadata(backup)}</span></div>
}
