import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Icon } from './Icon'

export type OverflowButtonSize = 'compact' | 'regular'
export type OverflowButtonVariant = 'default' | 'quiet'

export interface OverflowButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label?: string
  tooltip?: string | false
  size?: OverflowButtonSize
  variant?: OverflowButtonVariant
}

export const OverflowButton = forwardRef<HTMLButtonElement, OverflowButtonProps>(function OverflowButton({
  label = 'Mais ações',
  tooltip = label,
  size = 'regular',
  variant = 'default',
  className = '',
  type = 'button',
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={`overflow-button overflow-button--${size} overflow-button--${variant} ${className}`}
      aria-label={label}
      title={tooltip || undefined}
      {...props}
    >
      <Icon name="more" />
    </button>
  )
})
