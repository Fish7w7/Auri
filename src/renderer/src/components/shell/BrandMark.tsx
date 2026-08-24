import { APP_BRAND } from '@shared/constants/app-branding'

export function BrandMark({ large = false }: { large?: boolean }) {
  return <div className={`brand-mark ${large ? 'brand-mark--large' : ''}`}><img src={APP_BRAND.iconPath} alt="" draggable={false} /></div>
}