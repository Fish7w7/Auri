import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { RendererErrorBoundary } from './app/RendererErrorBoundary'
import './styles/global.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Elemento raiz do Renderer não encontrado.')
}

createRoot(root).render(
  <StrictMode>
    <RendererErrorBoundary><App /></RendererErrorBoundary>
  </StrictMode>
)
