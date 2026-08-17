import type { LibrarySummary, UserStatus } from '@shared/contracts'
import type { AppRoute } from '../../app/navigation'
import { navigate } from '../../app/navigation'
import { STATUS_LABELS } from '../../lib/format'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/Button'

const statusItems: Array<{ status: UserStatus; icon: IconName }> = [
  { status: 'reading', icon: 'book-open' },
  { status: 'want_to_read', icon: 'bookmark' },
  { status: 'paused', icon: 'pause' },
  { status: 'waiting', icon: 'clock' },
  { status: 'completed', icon: 'check' },
  { status: 'dropped', icon: 'x-circle' }
]

function NavButton({ icon, label, count, active, compact, onClick }: { icon: IconName; label: string; count?: number; active: boolean; compact: boolean; onClick(): void }) {
  return <button className={`sidebar-link ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} title={compact ? label : undefined}><Icon name={icon} /><span>{label}</span>{count !== undefined && count > 0 && <small>{count}</small>}</button>
}

export function Sidebar({ route, summary, compact, onToggleCompact }: { route: AppRoute; summary: LibrarySummary; compact: boolean; onToggleCompact(): void }) {
  return (
    <aside className={`sidebar ${compact ? 'sidebar--compact' : ''}`}>
      <div className="sidebar__brand"><div className="brand-mark">L</div><strong>Lumi</strong><IconButton icon="panel-left" label={compact ? 'Expandir sidebar' : 'Recolher sidebar'} onClick={onToggleCompact} /></div>
      <nav aria-label="Navegação principal">
        <div className="sidebar__group">
          <NavButton icon="home" label="Home" active={route.page === 'home'} compact={compact} onClick={() => navigate('/')} />
          <NavButton icon="library" label="Biblioteca" count={summary.total} active={route.page === 'library' && !('status' in route) && !('favorite' in route)} compact={compact} onClick={() => navigate('/library')} />
        </div>
        <div className="sidebar__group sidebar__group--statuses">
          {statusItems.map((item) => <NavButton key={item.status} icon={item.icon} label={STATUS_LABELS[item.status]} count={summary.byStatus[item.status]} active={route.page === 'library' && route.status === item.status} compact={compact} onClick={() => navigate(`/library/status/${item.status}`)} />)}
        </div>
        <div className="sidebar__group">
          <NavButton icon="star" label="Favoritos" count={summary.favorite} active={route.page === 'library' && route.favorite === true} compact={compact} onClick={() => navigate('/library/favorites')} />
          <NavButton icon="layers" label="Coleções" active={route.page === 'collections'} compact={compact} onClick={() => navigate('/collections')} />
        </div>
        <div className="sidebar__group">
          <NavButton icon="trash" label="Lixeira" active={route.page === 'trash'} compact={compact} onClick={() => navigate('/trash')} />
        </div>
      </nav>
      <div className="sidebar__footer"><NavButton icon="settings" label="Configurações" active={route.page === 'settings'} compact={compact} onClick={() => navigate('/settings')} /></div>
    </aside>
  )
}

