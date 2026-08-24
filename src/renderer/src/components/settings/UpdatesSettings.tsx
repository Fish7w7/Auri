import { useCallback, useEffect, useState } from 'react'
import type { UpdateState } from '@shared/contracts'
import { Button } from '../ui/Button'
import { LoadingState } from '../ui/States'
import { useToast } from '../ui/Toast'
import { SettingRow } from './SettingRow'
import { ReleaseNotes } from './ReleaseNotes'
import { APP_BRAND } from '@shared/constants/app-branding'

export function UpdatesSettings() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const load = useCallback(() => void window.auri.updates.state().then(setState), [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!state || !shouldPollUpdateState(state.status)) return
    const timer = window.setInterval(load, 750)
    return () => window.clearInterval(timer)
  }, [load, state?.status])

  async function run(operation: () => Promise<UpdateState>, pendingStatus: 'checking' | 'downloading', errorMessage: string) {
    setBusy(true)
    setState((current) => current ? { ...current, status: pendingStatus, errorMessage: null } : current)
    try { setState(await operation()) }
    catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : errorMessage }); load() }
    finally { setBusy(false) }
  }

  if (!state) return <><div className="settings-heading"><h2>Atualizações</h2><p>Verifique e instale novas versões do {APP_BRAND.name}.</p></div><LoadingState /></>
  const unavailableMessage = state.availability === 'development'
    ? `Atualizações não estão disponíveis nesta build de desenvolvimento do ${APP_BRAND.name}.`
    : 'Esta compilação não possui uma fonte de atualizações configurada.'

  return <><div className="settings-heading"><h2>Atualizações</h2><p>Verifique e instale novas versões do {APP_BRAND.name}.</p></div><div className="update-card"><SettingRow title="Versão atual" description={state.currentVersion}><span className={`update-status update-status--${state.status}`}>{statusLabel(state)}</span></SettingRow>
    {state.availability !== 'ready' ? <p className="update-message">{unavailableMessage}</p> : <>
      {state.status === 'downloading' && <div className="update-progress"><div style={{ width: `${state.progressPercent ?? 0}%` }} /><span>{Math.round(state.progressPercent ?? 0)}%</span></div>}
      {state.errorMessage && <p className="setting-warning">{state.errorMessage}</p>}
      {state.availableVersion && ['available', 'downloading', 'ready'].includes(state.status) && <div className="update-version"><span>Nova versão disponível</span><strong>{state.availableVersion}</strong></div>}
      {state.releaseNotes && <ReleaseNotes notes={state.releaseNotes} />}
      <div className="data-actions">
        {(state.status === 'idle' || state.status === 'up_to_date' || state.status === 'error') && <Button disabled={busy} onClick={() => void run(() => window.auri.updates.check(), 'checking', 'Não foi possível verificar atualizações.')}>Verificar atualizações</Button>}
        {state.status === 'checking' && <Button disabled>Verificando…</Button>}
        {state.status === 'available' && <Button variant="primary" disabled={busy} onClick={() => void run(() => window.auri.updates.download(), 'downloading', 'Não foi possível baixar a atualização.')}>Baixar atualização {state.availableVersion}</Button>}
        {state.status === 'downloading' && <Button disabled>Baixando…</Button>}
        {state.status === 'ready' && <><Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); try { await window.auri.updates.install() } catch (error) { showToast({ kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível instalar agora.' }); setBusy(false); load() } }}>Reiniciar e atualizar</Button><span className="update-later">Depois — a atualização permanecerá pronta.</span></>}
      </div>
    </>}
  </div></>
}

export function shouldPollUpdateState(status: UpdateState['status']): boolean {
  return status === 'checking' || status === 'downloading'
}

function statusLabel(state: UpdateState): string {
  if (state.status === 'unavailable') return 'Indisponível nesta build'
  return ({ idle: 'Pronto para verificar', checking: 'Verificando…', up_to_date: 'Atualizado', available: 'Disponível', downloading: 'Baixando…', ready: 'Pronta para instalar', error: 'Erro ao verificar' } as const)[state.status]
}
