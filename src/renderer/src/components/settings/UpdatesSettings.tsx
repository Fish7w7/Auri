import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateState } from '@shared/contracts'
import { APP_BRAND } from '@shared/constants/app-branding'
import { Button } from '../ui/Button'
import { ErrorState, LoadingState } from '../ui/States'
import { useToast } from '../ui/Toast'
import { ReleaseNotes } from './ReleaseNotes'

export function UpdatesSettings() {
  const [state, setState] = useState<UpdateState | null>(null)
  const [initialLoad, setInitialLoad] = useState<InitialUpdateLoad['status']>('loading')
  const initialLoadPending = useRef(false)
  const mounted = useRef(false)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()
  const loadInitial = useCallback(() => void loadInitialUpdateState(
    initialLoadPending,
    () => window.auri.updates.state(),
    (next) => {
      setInitialLoad(next.status)
      if (next.status === 'ready') setState(next.state)
    },
    () => mounted.current
  ), [])
  const load = useCallback(() => {
    void window.auri.updates.state()
      .then((next) => { if (mounted.current) setState(next) })
      .catch(() => { /* Uma falha de consulta posterior preserva o estado conhecido. */ })
  }, [])

  useEffect(() => {
    mounted.current = true
    loadInitial()
    return () => { mounted.current = false }
  }, [loadInitial])
  useEffect(() => {
    if (!state || !shouldPollUpdateState(state.status)) return
    const timer = window.setInterval(load, 750)
    return () => window.clearInterval(timer)
  }, [load, state?.status])

  async function run(operation: () => Promise<UpdateState>, pendingStatus: 'checking' | 'downloading', errorMessage: string) {
    setBusy(true)
    setState((current) => current ? { ...current, status: pendingStatus, errorMessage: null } : current)
    try {
      setState(await operation())
    } catch {
      setState((current) => current ? { ...current, status: 'error', errorMessage, errorContext: pendingStatus === 'downloading' ? 'download' : 'check' } : current)
      load()
    } finally {
      setBusy(false)
    }
  }

  async function install() {
    setBusy(true)
    try {
      await window.auri.updates.install()
    } catch {
      showToast({ kind: 'error', message: 'Não foi possível instalar a atualização agora.' })
      setBusy(false)
      load()
    }
  }

  if (!state) return <><SettingsHeading /><InitialUpdateStateFeedback status={initialLoad} onRetry={loadInitial} /></>
  const readyForActions = state.availability === 'ready'
  const checkedAt = state.lastCheckedAt ? formatUpdateCheckedAt(state.lastCheckedAt) : null
  const progress = Math.round(state.progressPercent ?? 0)
  const availableVersion = state.availableVersion ?? state.currentVersion

  return <>
    <SettingsHeading />
    <section className="settings-group">
      <header><h3>Versão</h3></header>
      <div className={`settings-group__body update-summary update-summary--${state.status}`}>
        <div className="update-summary__body">
          <div className="update-summary__identity">
            <span className="update-summary__current">{APP_BRAND.name} {state.currentVersion}</span>
            {state.isDevelopmentMock && <span className="update-mock-badge">Simulação de atualização</span>}
          </div>
          {state.status === 'downloading' ? <div className="update-download">
            <div className="update-download__heading"><strong>Baixando {APP_BRAND.name} {availableVersion}</strong><span>{progress}%</span></div>
            <div className="update-progress" role="progressbar" aria-label="Progresso do download da atualização" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div style={{ width: progress + '%' }} /></div>
            <p>Você pode continuar usando o {APP_BRAND.name} durante o download.</p>
          </div> : <>
            <strong className="update-summary__message">{updateStatusMessage(state)}</strong>
            {state.status === 'idle' && !checkedAt && <p className="update-summary__checked">Ainda não verificada nesta sessão.</p>}
            {checkedAt && (state.status === 'up_to_date' || state.status === 'available') && <p className="update-summary__checked">{checkedAt}</p>}
          </>}
        </div>

        {readyForActions && <div className="update-summary__actions">
          {state.status === 'idle' && <Button disabled={busy} onClick={() => void run(() => window.auri.updates.check(), 'checking', 'Não foi possível verificar atualizações.')}>Verificar atualizações</Button>}
          {state.status === 'up_to_date' && <Button disabled={busy} onClick={() => void run(() => window.auri.updates.check(), 'checking', 'Não foi possível verificar atualizações.')}>Verificar novamente</Button>}
          {state.status === 'available' && <Button variant="primary" disabled={busy} onClick={() => void run(() => window.auri.updates.download(), 'downloading', 'Não foi possível baixar a atualização.')}>Baixar atualização</Button>}
          {state.status === 'ready' && <Button variant="primary" disabled={busy} onClick={() => void install()}>Reiniciar e instalar</Button>}
          {state.status === 'error' && state.errorContext === 'download' && state.availableVersion && <Button disabled={busy} onClick={() => void run(() => window.auri.updates.download(), 'downloading', 'Não foi possível baixar a atualização.')}>Tentar baixar novamente</Button>}
          {state.status === 'error' && state.errorContext !== 'download' && <Button disabled={busy} onClick={() => void run(() => window.auri.updates.check(), 'checking', 'Não foi possível verificar atualizações.')}>Tentar novamente</Button>}
        </div>}
      </div>
    </section>

    {state.releaseNotes && <section className="settings-group update-release-section">
      <header><h3>Novidades da versão {state.availableVersion}</h3></header>
      <div className="settings-group__body"><ReleaseNotes notes={state.releaseNotes} /></div>
    </section>}
  </>
}

export type InitialUpdateLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; state: UpdateState }

export async function loadInitialUpdateState(
  pending: { current: boolean },
  request: () => Promise<UpdateState>,
  onChange: (next: InitialUpdateLoad) => void,
  isActive: () => boolean = () => true
): Promise<void> {
  if (pending.current) return
  pending.current = true
  onChange({ status: 'loading' })
  try {
    const state = await request()
    if (isActive()) onChange({ status: 'ready', state })
  } catch {
    if (isActive()) onChange({ status: 'error' })
  } finally {
    pending.current = false
  }
}

export function InitialUpdateStateFeedback({ status, onRetry }: { status: InitialUpdateLoad['status']; onRetry(): void }) {
  if (status === 'error') return <ErrorState title="Não foi possível carregar o estado das atualizações." description="A consulta não foi concluída." onRetry={onRetry} />
  if (status === 'loading') return <LoadingState />
  return null
}

function SettingsHeading() {
  return <div className="settings-heading"><h2>Atualizações</h2><p>Mantenha o Auri atualizado e acompanhe as novidades.</p></div>
}

export function shouldPollUpdateState(status: UpdateState['status']): boolean {
  return status === 'checking' || status === 'downloading'
}

export function formatUpdateCheckedAt(value: string | Date, now = new Date()): string {
  const checkedAt = value instanceof Date ? value : new Date(value)
  const sameDay = checkedAt.getFullYear() === now.getFullYear() && checkedAt.getMonth() === now.getMonth() && checkedAt.getDate() === now.getDate()
  const date = sameDay ? 'hoje' : checkedAt.toLocaleDateString('pt-BR')
  return 'Verificado ' + date + ', ' + checkedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function updateStatusMessage(state: UpdateState): string {
  const availableVersion = state.availableVersion ?? state.currentVersion
  if (state.status === 'unavailable') {
    return state.availability === 'development'
      ? `Atualizações não estão disponíveis nesta build de desenvolvimento do ${APP_BRAND.name}.`
      : 'Esta compilação não possui uma fonte de atualizações configurada.'
  }
  return ({
    idle: 'Verifique quando quiser se há uma nova versão.',
    checking: 'Verificando atualizações...',
    up_to_date: 'Você está usando a versão mais recente.',
    available: `${availableVersion} está disponível`,
    downloading: `Baixando ${APP_BRAND.name} ${availableVersion}`,
    ready: `${APP_BRAND.name} ${availableVersion} está pronta para instalar`,
    error: state.errorMessage ?? 'Não foi possível verificar atualizações.'
  } as const)[state.status]
}
