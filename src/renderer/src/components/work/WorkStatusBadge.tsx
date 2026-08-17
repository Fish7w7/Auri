import type { UserStatus } from '@shared/contracts'
import { STATUS_LABELS } from '../../lib/format'

export function WorkStatusBadge({ status }: { status: UserStatus }) {
  return <span className={`status-badge status-badge--${status}`}><i aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

