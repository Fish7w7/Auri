import { useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { LibrarySummary, UserStatus } from '@shared/contracts'
import type { AppRoute } from '../../app/navigation'
import { navigate } from '../../app/navigation'
import { STATUS_LABELS } from '../../lib/format'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/Button'
import { APP_BRAND } from '@shared/constants/app-branding'

const statusItems: Array<{ status: UserStatus; icon: IconName }> = [
  { status: 'reading', icon: 'book-open' },
  { status: 'want_to_read', icon: 'bookmark' },
  { status: 'paused', icon: 'pause' },
  { status: 'waiting', icon: 'clock' },
  { status: 'completed', icon: 'check' },
  { status: 'dropped', icon: 'x-circle' }
]

type Tooltip = { label: string; count?: number; top: number }

function NavButton({ icon, label, count, active, compact, onClick, onShowTooltip, onHideTooltip }: { icon: IconName; label: string; count?: number; active: boolean; compact: boolean; onClick(): void; onShowTooltip(event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>, label: string, count?: number): void; onHideTooltip(): void }) {
  return <button className={`sidebar-link ${active ? 'is-active' : ''}`} onClick={onClick} onMouseEnter={(event) => onShowTooltip(event, label, count)} onMouseLeave={onHideTooltip} onFocus={(event) => onShowTooltip(event, label, count)} onBlur={onHideTooltip} aria-label={compact ? `${label}${count !== undefined ? `, ${count}` : ''}` : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon} /><span>{label}</span>{count !== undefined && count > 0 && <small>{count}</small>}</button>
}

export function Sidebar({ route, summary, compact, onToggleCompact }: { route: AppRoute; summary: LibrarySummary; compact: boolean; onToggleCompact(): void }) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)
  const showTooltip = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>, label: string, count?: number) => {
    if (!compact) return
    const bounds = event.currentTarget.getBoundingClientRect()
    setTooltip({ label, count, top: bounds.top + bounds.height / 2 })
  }
  const navProps = { compact, onShowTooltip: showTooltip, onHideTooltip: () => setTooltip(null) }
  return (
    <aside className={`sidebar ${compact ? 'sidebar--compact' : ''}`}>
      <div className="sidebar__brand"><strong>{APP_BRAND.name}</strong><IconButton icon="panel-left" label={compact ? 'Expandir sidebar' : 'Recolher sidebar'} onClick={onToggleCompact} /></div>
      <nav aria-label="Navegação principal">
        <div className="sidebar__group">
          <NavButton icon="home" label="Home" active={route.page === 'home'} {...navProps} onClick={() => navigate('/')} />
          <NavButton icon="library" label="Biblioteca" count={summary.total} active={route.page === 'library' && !('status' in route) && !('favorite' in route)} {...navProps} onClick={() => navigate('/library')} />
        </div>
        <div className="sidebar__group sidebar__group--statuses">
          {statusItems.map((item) => <NavButton key={item.status} icon={item.icon} label={STATUS_LABELS[item.status]} count={summary.byStatus[item.status]} active={route.page === 'library' && route.status === item.status} {...navProps} onClick={() => navigate(`/library/status/${item.status}`)} />)}
        </div>
        <div className="sidebar__group">
          <NavButton icon="star" label="Favoritos" count={summary.favorite} active={route.page === 'library' && route.favorite === true} {...navProps} onClick={() => navigate('/library/favorites')} />
          <NavButton icon="layers" label="Coleções" active={route.page === 'collections'} {...navProps} onClick={() => navigate('/collections')} />
        </div>
        <div className="sidebar__group">
          <NavButton icon="trash" label="Lixeira" active={route.page === 'trash'} {...navProps} onClick={() => navigate('/trash')} />
        </div>
      </nav>
      <div className="sidebar__footer"><NavButton icon="settings" label="Configurações" active={route.page === 'settings'} {...navProps} onClick={() => navigate('/settings')} /></div>
      {compact && tooltip && createPortal(<div className="sidebar-tooltip" role="tooltip" style={{ top: tooltip.top }}><strong>{tooltip.label}</strong>{tooltip.count !== undefined && <span>{tooltip.count}</span>}</div>, document.body)}
    </aside>
  )
}
