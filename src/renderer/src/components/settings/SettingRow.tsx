import type { ReactNode } from 'react'

export function SettingRow({ title, description, children }: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return <div className="setting-row">
    <div className="setting-row__copy"><strong>{title}</strong>{description && <p>{description}</p>}</div>
    <div className="setting-row__control">{children}</div>
  </div>
}
