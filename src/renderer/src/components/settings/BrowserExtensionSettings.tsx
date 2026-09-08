import { useCallback, useEffect, useRef, useState } from 'react'
import { BROWSER_EXTENSIONS_URLS, type BrowserExtensionApi, type BrowserExtensionStatus, type SupportedBrowser, type BrowserOpenResult } from '@shared/contracts/browser-extension'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { useToast, type ToastInput } from '../ui/Toast'

type ManualBrowser = 'chrome' | 'brave'
type ExtensionAction = 'install-chrome' | 'install-brave' | 'edge-store' | 'extensions' | 'folder' | 'copy' | 'copy-url'
export interface ManualInstallationResult { folder: 'opened' | 'failed'; browser: BrowserOpenResult['state'] | 'failed' }
const browserName = (browser: SupportedBrowser) => browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : 'Brave'

export async function beginManualInstallation(api: BrowserExtensionApi, browser: ManualBrowser): Promise<ManualInstallationResult> {
  const result: ManualInstallationResult = { folder: 'failed', browser: 'failed' }
  // Await Explorer first; dispatch the browser last without artificial delays.
  try { await api.openFolder(); result.folder = 'opened' } catch { /* Independent recovery in the guide. */ }
  try { result.browser = (await api.openExtensionsPage(browser)).state } catch { /* Never infer navigation from process creation. */ }
  return result
}

export function manualInstallationFeedback(result: ManualInstallationResult, browser: ManualBrowser): ToastInput | null {
  if (result.browser !== 'failed') {
    const feedback = browserOpeningFeedback({ state: result.browser }, browser)
    if (result.folder === 'opened') return feedback
    return { kind: 'warning', message: feedback.message + ' Não foi possível abrir a pasta. Use “Abrir pasta” no guia.' }
  }
  if (result.folder === 'opened') return { kind: 'error', message: 'Pasta aberta, mas não foi possível abrir a página de extensões do ' + browserName(browser) + '. Copie o endereço no guia.' }
  return { kind: 'error', message: 'Não foi possível abrir a pasta nem solicitar a abertura do navegador. Use as ações do guia para tentar novamente.' }
}

export function browserOpeningFeedback(result: BrowserOpenResult, browser: SupportedBrowser): ToastInput {
  const name = browserName(browser)
  if (result.state === 'already-running') return { kind: 'info', message: 'O ' + name + ' já está em execução. Copie o endereço do guia e cole na barra de endereço da janela que você já usa.' }
  if (result.state === 'unknown') return { kind: 'warning', message: 'Não foi possível verificar se o ' + name + ' está em execução. Abra o navegador manualmente e use o endereço do guia.' }
  return { kind: 'info', message: 'O ' + name + ' não estava em execução. A abertura foi solicitada; se a página não abrir, copie o endereço do guia.' }
}

export async function openBrowserFromGuide(api: BrowserExtensionApi, browser: SupportedBrowser): Promise<ToastInput> {
  try { return browserOpeningFeedback(await api.openExtensionsPage(browser), browser) }
  catch { return { kind: 'error', message: 'Não foi possível abrir a página de extensões. Copie o endereço indicado e cole no navegador.' } }
}

export async function browserExtensionAction(operation: () => Promise<void>, success: string, failure: string, kind: 'success' | 'info' = 'success'): Promise<ToastInput> {
  try { await operation(); return { kind, message: success } }
  catch { return { kind: 'error', message: failure } }
}

export function BrowserExtensionSettings() {
  const { showToast } = useToast()
  const [status, setStatus] = useState<BrowserExtensionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<ExtensionAction | null>(null)
  const [guide, setGuide] = useState<ManualBrowser | null>(null)
  const [edgeHelp, setEdgeHelp] = useState(false)
  const pending = useRef(false)
  const detectionPending = useRef(false)
  const mounted = useRef(false)
  const load = useCallback(async () => {
    if (detectionPending.current || pending.current) return
    detectionPending.current = true
    setLoading(true)
    setLoadError(false)
    try {
      const next = await window.auri.browserExtension.getStatus()
      if (mounted.current) {
        setStatus(next)
        setGuide((current) => current && next.embeddedAvailable && next.browsers.some((item) => item.browser === current && item.installed) ? current : null)
      }
    } catch { if (mounted.current) setLoadError(true) }
    finally { detectionPending.current = false; if (mounted.current) setLoading(false) }
  }, [])
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false } }, [load])

  const run = async (action: ExtensionAction, operation: () => Promise<ToastInput | null>) => {
    if (pending.current || detectionPending.current) return
    pending.current = true
    setBusy(action)
    try {
      const feedback = await operation()
      if (mounted.current && feedback) showToast({ ...feedback, dedupeKey: 'browser-extension-' + action })
    } finally { pending.current = false; if (mounted.current) setBusy(null) }
  }
  const api = () => window.auri.browserExtension
  const begin = (browser: SupportedBrowser) => {
    if (pending.current || detectionPending.current) return
    if (browser === 'edge') {
      void run('edge-store', () => browserExtensionAction(() => api().openEdgeStore(), 'Edge Add-ons aberto.', 'Não foi possível abrir o Edge Add-ons. Tente novamente.'))
      return
    }
    setGuide(browser)
    void run('install-' + browser as ExtensionAction, async () => manualInstallationFeedback(await beginManualInstallation(api(), browser), browser))
  }

  return <BrowserExtensionView status={status} loading={loading} loadError={loadError} busy={busy} guide={guide} edgeHelp={edgeHelp}
    onRefresh={() => void load()} onBegin={begin}
    onOpenPage={(browser) => {
      if (pending.current || detectionPending.current) return
      if (browser === 'edge') setEdgeHelp(true)
      void run('extensions', () => openBrowserFromGuide(api(), browser))
    }}
    onOpenFolder={() => void run('folder', () => browserExtensionAction(() => api().openFolder(), 'Pasta da extensão aberta.', 'Não foi possível abrir a pasta da extensão. Tente novamente.'))}
    onCopyPath={() => void run('copy', () => browserExtensionAction(() => api().copyPath(), 'Caminho da extensão copiado.', 'Não foi possível copiar o caminho. Tente novamente.'))}
    onCopyUrl={(browser) => void run('copy-url', () => browserExtensionAction(() => api().copyExtensionsUrl(browser), 'Endereço copiado. Cole na barra de endereço do navegador.', 'Não foi possível copiar o endereço. Tente novamente.'))} />
}

export interface BrowserExtensionViewProps {
  status: BrowserExtensionStatus | null
  loading: boolean
  loadError: boolean
  busy: ExtensionAction | null
  guide: ManualBrowser | null
  edgeHelp: boolean
  onRefresh(): void
  onBegin(browser: SupportedBrowser): void
  onOpenPage(browser: SupportedBrowser): void
  onOpenFolder(): void
  onCopyPath(): void
  onCopyUrl(browser: SupportedBrowser): void
}

function AddressFallback({ browser, disabled, copying, onCopy }: { browser: SupportedBrowser; disabled: boolean; copying: boolean; onCopy(): void }) {
  return <div className="browser-extension-address">
    <p>Use a janela do {browserName(browser)} que já está aberta. Para acessar as extensões, copie o endereço abaixo e cole na barra de endereço. O Auri só tenta iniciar o navegador se ele não estiver em execução.</p>
    <div><code>{BROWSER_EXTENSIONS_URLS[browser]}</code><Button variant="ghost" disabled={disabled} aria-label={'Copiar ' + BROWSER_EXTENSIONS_URLS[browser]} onClick={onCopy}>{copying ? 'Copiando…' : 'Copiar endereço'}</Button></div>
  </div>
}

export function BrowserExtensionView(props: BrowserExtensionViewProps) {
  const { status, loading, loadError, busy, guide } = props
  const disabled = loading || busy !== null
  const selected = guide && status?.embeddedAvailable && status.browsers.some((item) => item.browser === guide && item.installed) ? guide : null
  return <div className="browser-extension-settings">
    <div className="settings-heading"><h2>Extensão do navegador</h2><p>Conecte páginas de leitura ao Auri diretamente pelo navegador.</p></div>
    <div className="browser-extension-toolbar">
      <div className="browser-extension-included"><Icon name="link" /><span>Auri Extension</span>{status && <span className="browser-extension-version">{status.embeddedVersion} incluída</span>}</div>
      <Button variant="ghost" icon="rotate" disabled={disabled} onClick={props.onRefresh}>{loading ? 'Verificando navegadores…' : 'Atualizar detecção'}</Button>
    </div>
    {loading && <p className="sr-only" role="status">Verificando navegadores…</p>}
    {loadError && <div role="alert" className="browser-extension-notice"><Icon name="alert" /><div><p>Não foi possível verificar os navegadores.{status ? ' Os resultados anteriores foram mantidos.' : ''}</p><Button disabled={disabled} onClick={props.onRefresh}>Tentar novamente</Button></div></div>}
    {status && !status.embeddedAvailable && <div role="alert" className="browser-extension-notice"><Icon name="alert" /><p>Os arquivos da Auri Extension não estão disponíveis nesta instalação. Atualize ou reinstale o Auri para prepará-los novamente.</p></div>}
    <div className="browser-extension-grid" aria-label="Navegadores" aria-busy={loading}>
      {status?.browsers.map((item) => <section className={'browser-extension-card' + (!item.installed ? ' is-unavailable' : '') + (selected === item.browser ? ' is-selected' : '')} key={item.browser} aria-labelledby={'browser-' + item.browser}>
        <header><span className="browser-extension-icon"><Icon name="link" /></span><h3 id={'browser-' + item.browser}>{item.displayName}</h3></header>
        <span className={'browser-extension-status' + (item.installed ? ' is-detected' : '')}><Icon name={item.installed ? 'check' : 'x-circle'} />{item.installed ? 'Detectado' : 'Não encontrado'}</span>
        <div className="browser-extension-description"><strong>{item.browser === 'edge' ? 'Disponível oficialmente' : 'Instalação manual'}</strong><p>{item.browser === 'edge' ? 'Instalação oficial pelo Microsoft Edge Add-ons.' : 'Com os arquivos incluídos no Auri.'}</p></div>
        {item.installed && <div className="browser-extension-card-actions">
          {item.availableAction && <Button variant={selected === item.browser ? 'secondary' : 'primary'} disabled={disabled} aria-expanded={item.browser === 'edge' ? undefined : selected === item.browser} aria-controls={item.browser === 'edge' ? undefined : 'browser-install-guide'} onClick={() => props.onBegin(item.browser)}>
            {busy === 'install-' + item.browser || (item.browser === 'edge' && busy === 'edge-store') ? 'Preparando…' : item.browser === 'edge' ? 'Abrir no Edge Add-ons' : 'Instalar no ' + browserName(item.browser)}
          </Button>}
          {item.browser === 'edge' && <Button variant="ghost" disabled={disabled} onClick={() => props.onOpenPage('edge')}>{busy === 'extensions' && !selected ? 'Abrindo…' : 'Abrir extensões'}</Button>}
        </div>}
        {item.browser === 'edge' && item.installed && props.edgeHelp && <AddressFallback browser="edge" disabled={disabled} copying={busy === 'copy-url'} onCopy={() => props.onCopyUrl('edge')} />}
      </section>)}
    </div>
    {selected && <section className="browser-extension-guide" id="browser-install-guide" aria-labelledby="browser-install-heading">
      <header><Icon name="link" /><div><span className="browser-extension-eyebrow">Instalação guiada</span><h3 id="browser-install-heading">Instalar no {browserName(selected)}</h3><p>O Auri já preparou os arquivos. Na página de extensões do navegador:</p></div></header>
      <AddressFallback browser={selected} disabled={disabled} copying={busy === 'copy-url'} onCopy={() => props.onCopyUrl(selected)} />
      <ol className="browser-extension-steps">
        <li><span aria-hidden="true">1</span><div><strong>Ative o Modo do desenvolvedor</strong><p>Encontre essa opção na página de extensões.</p></div></li>
        <li><span aria-hidden="true">2</span><div><strong>Clique em “Carregar sem compactação”</strong><p>A opção também pode aparecer como “Load unpacked”.</p></div></li>
        <li><span aria-hidden="true">3</span><div><strong>Selecione a pasta preparada pelo Auri</strong><p>Use a pasta aberta no Explorer ou copie o caminho abaixo.</p></div></li>
      </ol>
      <div className="browser-extension-actions">
        <Button variant="primary" disabled={disabled} onClick={() => props.onOpenPage(selected)}>{busy === 'extensions' ? 'Abrindo…' : 'Abrir extensões'}</Button>
        <Button disabled={disabled} onClick={props.onOpenFolder}>{busy === 'folder' ? 'Abrindo…' : 'Abrir pasta'}</Button>
        <Button variant="ghost" disabled={disabled} onClick={props.onCopyPath}>{busy === 'copy' ? 'Copiando…' : 'Copiar caminho'}</Button>
      </div>
      <div className="browser-extension-update"><Icon name="rotate" /><p>Após uma atualização do Auri, talvez seja necessário clicar em Recarregar na página de extensões do navegador.</p></div>
    </section>}
    <aside className="browser-extension-privacy"><Icon name="home" /><p>A comunicação acontece no seu computador, sem conta ou nuvem. Você conclui a instalação no navegador.</p></aside>
  </div>
}
