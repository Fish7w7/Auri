import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserExtensionApi, BrowserExtensionStatus, SupportedBrowser } from '@shared/contracts'
import { Button } from '../ui/Button'

export async function beginManualInstallation(api: BrowserExtensionApi, browser: 'chrome' | 'brave'): Promise<void> {
  // Attempt both actions; either failure is reported and the guide stays available.
  const results = await Promise.allSettled([api.openExtensionsPage(browser), api.openFolder()])
  if (results.some((result) => result.status === 'rejected')) throw new Error('Não foi possível abrir tudo. Use os botões abaixo para tentar novamente.')
}

export async function browserExtensionAction(operation: () => Promise<void>, success: string): Promise<{ kind: 'success' | 'error'; message: string }> {
  try { await operation(); return { kind: 'success', message: success } }
  catch { return { kind: 'error', message: 'Não foi possível concluir a ação. Tente novamente. Se o problema persistir, atualize ou reinstale o Auri.' } }
}

export function BrowserExtensionSettings() {
  const [status, setStatus] = useState<BrowserExtensionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(false)
  const [guide, setGuide] = useState<'chrome' | 'brave' | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const guideRef = useRef<HTMLHeadingElement>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await window.auri.browserExtension.getStatus()
      if (mounted.current) { setStatus(next); setFeedback(null) }
    } catch { if (mounted.current) setFeedback({ kind: 'error', message: 'Não foi possível verificar os navegadores. Tente novamente.' }) }
    finally { if (mounted.current) setLoading(false) }
  }, [])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [load])
  useEffect(() => { if (guide) guideRef.current?.focus() }, [guide])

  const run = async (operation: () => Promise<void>, success: string) => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setFeedback(null)
    const result = await browserExtensionAction(operation, success)
    if (mounted.current) { setFeedback(result); setBusy(false) }
    pending.current = false
  }
  const begin = (browser: SupportedBrowser) => {
    if (browser === 'edge') { void run(() => window.auri.browserExtension.openEdgeStore(), 'Edge Add-ons aberto.'); return }
    setGuide(browser)
    void run(() => beginManualInstallation(window.auri.browserExtension, browser), 'Página de extensões e pasta abertas. Siga os passos abaixo.')
  }

  return <BrowserExtensionView status={status} loading={loading} busy={busy} guide={guide} feedback={feedback} guideRef={guideRef}
    onRetry={() => void load()} onBegin={begin}
    onOpenPage={(browser) => void run(() => window.auri.browserExtension.openExtensionsPage(browser), 'Página de extensões aberta.')}
    onOpenFolder={() => void run(() => window.auri.browserExtension.openFolder(), 'Pasta da extensão aberta.')}
    onCopyPath={() => void run(() => window.auri.browserExtension.copyPath(), 'Caminho da extensão copiado.')} />
}

export interface BrowserExtensionViewProps {
  status: BrowserExtensionStatus | null
  loading: boolean
  busy: boolean
  guide: 'chrome' | 'brave' | null
  feedback: { kind: 'success' | 'error'; message: string } | null
  guideRef?: React.Ref<HTMLHeadingElement>
  onRetry(): void
  onBegin(browser: SupportedBrowser): void
  onOpenPage(browser: SupportedBrowser): void
  onOpenFolder(): void
  onCopyPath(): void
}

export function BrowserExtensionView(props: BrowserExtensionViewProps) {
  const { status, loading, busy, guide, feedback } = props
  return <>
    <div className="settings-heading"><h2>Extensão do navegador</h2><p>Conecte páginas de leitura ao Auri diretamente pelo navegador.</p></div>
    {status && <p className="browser-extension-included">Auri Extension {status.embeddedVersion} incluída</p>}
    {loading && <p role="status">Verificando navegadores…</p>}
    {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className="browser-extension-feedback">{feedback.message}</p>}
    {status && !status.embeddedAvailable && <div role="alert" className="browser-extension-feedback"><p>Os arquivos da Auri Extension não estão disponíveis nesta instalação.</p><p>Atualize ou reinstale o Auri para preparar os arquivos novamente.</p></div>}
    {status?.browsers.map((item) => <section className="settings-group" key={item.browser} aria-labelledby={`browser-${item.browser}`}>
      <header><h3 id={`browser-${item.browser}`}>{item.displayName}</h3></header>
      <div className="settings-group__body browser-extension-card">
        <p>{item.installed ? 'Navegador detectado.' : 'Não encontrado neste computador.'}</p>
        <p>{item.browser === 'edge' ? 'Disponível oficialmente pelo Microsoft Edge Add-ons.' : 'Instalação manual disponível com os arquivos incluídos no Auri.'}</p>
        <div className="browser-extension-actions">
          {item.availableAction && <Button variant="primary" disabled={busy || loading} aria-expanded={item.browser === 'edge' ? undefined : guide === item.browser} aria-controls={item.browser === 'edge' ? undefined : 'browser-install-guide'} onClick={() => props.onBegin(item.browser)}>{item.browser === 'edge' ? 'Abrir no Edge Add-ons' : 'Começar instalação'}</Button>}
          {item.installed && <Button disabled={busy || loading} onClick={() => props.onOpenPage(item.browser)}>Abrir extensões</Button>}
        </div>
      </div>
    </section>)}
    {guide && status?.embeddedAvailable && <section className="settings-group" id="browser-install-guide" aria-labelledby="browser-install-heading">
      <header><h3 id="browser-install-heading" tabIndex={-1} ref={props.guideRef}>Instalar no {guide === 'chrome' ? 'Google Chrome' : 'Brave'}</h3></header>
      <div className="settings-group__body browser-extension-card">
        <p>O Auri já preparou os arquivos. Na página de extensões do navegador:</p>
        <ol><li>Ative o Modo do desenvolvedor.</li><li>Clique em “Carregar sem compactação” (Load unpacked).</li><li>Selecione a pasta aberta pelo Auri.</li></ol>
        <div className="browser-extension-actions"><Button disabled={busy} onClick={props.onOpenFolder}>Abrir pasta</Button><Button disabled={busy} onClick={props.onCopyPath}>Copiar caminho</Button><Button disabled={busy} onClick={() => props.onOpenPage(guide)}>Abrir extensões</Button></div>
      </div>
    </section>}
    <p className="browser-extension-note">Após uma atualização do Auri, talvez seja necessário clicar em Recarregar na página de extensões do navegador.</p>
    <p className="browser-extension-note">A comunicação acontece no seu computador, sem conta ou nuvem. A instalação é feita por você no navegador.</p>
    <Button disabled={busy || loading} onClick={props.onRetry}>Tentar novamente</Button>
  </>
}
