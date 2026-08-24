import { Component, type ErrorInfo, type ReactNode } from 'react'
import { APP_BRAND } from '@shared/constants/app-branding'
import { BrandMark } from '../components/shell/BrandMark'

interface RendererErrorBoundaryState {
  failed: boolean
}

export class RendererErrorBoundary extends Component<{ children: ReactNode }, RendererErrorBoundaryState> {
  state: RendererErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Falha recuperável no Renderer do ${APP_BRAND.name}.`, error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return <main className="renderer-fallback" role="alert">
      <BrandMark large />
      <h1>O {APP_BRAND.name} encontrou um problema nesta tela.</h1>
      <p>Seus dados continuam salvos. Recarregue o aplicativo para tentar novamente.</p>
      <button className="button button--primary" onClick={() => window.location.reload()}>{`Recarregar ${APP_BRAND.name}`}</button>
    </main>
  }
}
