import type { SVGProps } from 'react'

export type IconName =
  | 'home'
  | 'library'
  | 'book-open'
  | 'bookmark'
  | 'pause'
  | 'clock'
  | 'check'
  | 'x-circle'
  | 'star'
  | 'layers'
  | 'trash'
  | 'settings'
  | 'panel-left'
  | 'search'
  | 'plus'
  | 'grid'
  | 'list'
  | 'filter'
  | 'chevron-left'
  | 'chevron-right'
  | 'more'
  | 'rotate'
  | 'alert'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/></>,
  library: <><path d="M4 4h5v16H4zM9 4h5v16H9zM15.5 5l4 14"/></>,
  'book-open': <><path d="M3 5.5c3.5-.8 6.5.1 9 2v12c-2.5-1.9-5.5-2.8-9-2z"/><path d="M21 5.5c-3.5-.8-6.5.1-9 2v12c2.5-1.9 5.5-2.8 9-2z"/></>,
  bookmark: <path d="M6 4h12v17l-6-4-6 4z"/>,
  pause: <><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  'x-circle': <><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></>,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>,
  layers: <><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  trash: <><path d="M4 7h16M9 3h6l1 4H8zM6 7l1 14h10l1-14M10 11v6m4-6v6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.8-1.8.9-1.9L15 4l-1.9.9-1.9-.8L10.5 2h-3l-.7 2.1-1.8.8L3.1 4 1 6.1 1.9 8l-.8 1.8-2.1.7v3l2.1.7.8 1.8-.9 1.9L3.1 20l1.9-.9 1.8.8.7 2.1h3l.7-2.1 1.9-.8 1.9.9 2.1-2.1-.9-1.9.8-1.8z" transform="translate(2.5) scale(.8)"/></>,
  'panel-left': <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z"/>,
  'chevron-left': <path d="m15 18-6-6 6-6"/>,
  'chevron-right': <path d="m9 18 6-6-6-6"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  rotate: <><path d="M4 11a8 8 0 0 1 14-5l2 2"/><path d="M20 3v5h-5M20 13a8 8 0 0 1-14 5l-2-2M4 21v-5h5"/></>,
  alert: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v5m0 3v.1"/></>
}

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
