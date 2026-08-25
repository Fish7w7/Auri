import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { Button } from '../ui/Button'
import { LoadingState } from '../ui/States'
import { useToast } from '../ui/Toast'
import { SettingRow } from './SettingRow'
import { ReleaseNotes } from './ReleaseNotes'

export function UpdatesSettings() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const load = useCallback(() => void window.auri.updates.state().then(setState), [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!state || !shouldPollUpdateState(state.status)) return
    const timer = window.setInterval(load, 750)
    return () => window.clearInterval(timer)
  }, [load, state?.status])

  async function run(operation: () => Promise<UpdateState>, pendingStatus: 'checking' | 'downloading', errorMessage: string, markChecked = false) {
    setBusy(true)
    setState((current) => current ? { ...current, status: pendingStatus, errorMessage: null } : current)
    try {
      setState(await operation())
      if (markChecked) setLastCheckedAt(new Date())
    } catch (error) {
      if (markChecked) setLastCheckedAt(new Date())
      showToast({ kind: 'error', message: error instanceof Error ? error.message : errorMessage })
      load()
    } finally { setBusy(false) }
  }

  if (!state) return <><SettingsHeading /><LoadingState /></>
  const unavailableMessage = state.availability === 'development'
    ? 'Atualizações não estão disponíveis nesta build de desenvolvimento do ' + APP_BRAND.name + '.'
    : 'Esta compilação não possui uma fonte de atualizações configurada.'
  const readyForActions = state.availability === 'ready'

  return <>
    <SettingsHeading />
    <section className="settings-group">
      <header><h3>Versão</h3></header>
      <div className="settings-group__body update-version-panel">
        <SettingRow title="Versão instalada" description={APP_BRAND.name + ' ' + state.currentVersion}><strong className="update-installed-version">{state.currentVersion}</strong></SettingRow>
        <SettingRow title="Estado da atualização" description={state.errorMessage ?? statusDescription(state)}><span className={'update-status update-status--' + state.status}>{statusLabel(state)}</span></SettingRow>
        <SettingRow title="Última verificação" description={lastCheckedAt ? formatUpdateCheckedAt(lastCheckedAt) : 'Ainda não verificada nesta sessão.'}>
          {readyForActions && (state.status === 'idle' || state.status === 'up_to_date' || state.status === 'error') ? <Button disabled={busy} onClick={() => void run(() => window.auri.updates.check(), 'checking', 'Não foi possível verificar atualizações.', true)}>Verificar atualizações</Button> : state.status === 'checking' ? <Button disabled>Verificando…</Button> : <span className="update-passive">—</span>}
        </SettingRow>
        {!readyForActions && <p className="update-message">{unavailableMessage}</p>}
        {readyForActions && state.availableVersion && ['available', 'downloading', 'ready'].includes(state.status) && <SettingRow title="Versão disponível" description={'A atualização ' + state.availableVersion + ' está disponível.'}><strong className="update-available-version">{state.availableVersion}</strong></SettingRow>}
        {readyForActions && state.status === 'downloading' && <div className="update-progress" aria-label={'Download da atualização: ' + Math.round(state.progressPercent ?? 0) + '%'}><div style={{ width: (state.progressPercent ?? 0) + '%' }} /><span>{Math.round(state.progressPercent ?? 0)}%</span></div>}
        {readyForActions && <div className="data-actions update-actions">
          {state.status === 'available' && <Button variant="primary" disabled={busy} onClick={() => void run(() => window.auri.updates.download(), 'downloading', 'Não foi possível baixar a atualização.')}>Baixar atualização</Button>}
          {state.status === 'downloading' && <Button disabled>Baixando…</Button>}
          {state.status === 'ready' && <><Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { await window.auri.updates.install() } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível instalar agora.' }); setBusy(false); load() } }}>Reiniciar e instalar</Button><span className="update-later">A atualização permanecerá pronta caso prefira instalar depois.</span></>}
        </div>}
      </div>
    </section>
    <section className="settings-group">
      <header><h3>Novidades</h3></header>
      <div className="settings-group__body">
        {state.releaseNotes ? <ReleaseNotes notes={state.releaseNotes} /> : <p className="settings-empty-note">As notas reais da versão aparecerão aqui quando forem fornecidas pelo updater.</p>}
      </div>
    </section>
  </>
}

function SettingsHeading() {
  return <div className="settings-heading"><h2>Atualizações</h2><p>Mantenha o Auri atualizado e acompanhe as novidades.</p></div>
}

export function shouldPollUpdateState(status: UpdateState['status']): boolean {
  return status === 'checking' || status === 'downloading'
}

export function formatUpdateCheckedAt(value: Date, now = new Date()): string {
  const sameDay = value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth() && value.getDate() === now.getDate()
  const date = sameDay ? 'hoje' : value.toLocaleDateString('pt-BR')
  return date + ', ' + value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function statusLabel(state: UpdateState): string {
  if (state.status === 'unavailable') return 'Indisponível nesta build'
  return ({ idle: 'Pronto para verificar', checking: 'Verificando…', up_to_date: 'Atualizado', available: 'Atualização disponível', downloading: 'Baixando…', ready: 'Pronta para instalar', error: 'Erro ao verificar' } as const)[state.status]
}

function statusDescription(state: UpdateState): string {
  return ({
    unavailable: 'O updater não está disponível neste ambiente.',
    idle: 'Nenhuma verificação foi iniciada nesta sessão.',
    checking: 'Consultando o canal estável do Auri.',
    up_to_date: 'Você está usando a versão mais recente disponível.',
    available: 'Uma nova versão está pronta para download.',
    downloading: 'O download está em andamento.',
    ready: 'A atualização foi baixada e pode ser instalada.',
    error: 'A última verificação não pôde ser concluída.'
  } as const)[state.status]
}