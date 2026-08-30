export interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  onCheckedChange(checked: boolean): void
}

export function Switch({ checked, label, disabled = false, onCheckedChange }: SwitchProps) {
  return <button
    className="switch"
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    onClick={() => { if (!disabled) onCheckedChange(!checked) }}
  >
    <span className="switch__thumb" aria-hidden="true" />
  </button>
}
