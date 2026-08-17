import type { ReactNode } from 'react'
import { Button } from './Button'

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label}</div>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state__mark">L</div><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ title = 'Não foi possível carregar sua biblioteca.', description = 'Seus dados não foram alterados.', onRetry }: { title?: string; description?: string; onRetry(): void }) {
  return <div className="error-state" role="alert"><h2>{title}</h2><p>{description}</p><Button icon="rotate" onClick={onRetry}>Tentar novamente</Button></div>
}
