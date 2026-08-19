import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RendererErrorBoundaryState {
  failed: boolean
}

export class RendererErrorBoundary extends Component<{ children: ReactNode }, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Falha recuperável no Renderer do Lumi.', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return <main className="renderer-fallback" role="alert">
      <div className="brand-mark brand-mark--large">L</div>
      <h1>O Lumi encontrou um problema nesta tela.</h1>
      <p>Seus dados continuam salvos. Recarregue o aplicativo para tentar novamente.</p>
      <button className="button button--primary" onClick={() => window.location.reload()}>Recarregar Lumi</button>
    </main>
  }
}
