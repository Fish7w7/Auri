import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from '@renderer/components/ui/Switch'

interface SwitchElementProps {
  role: string
  'aria-label': string
  'aria-checked': boolean
  disabled: boolean
  onClick(): void
}

function renderSwitch(checked: boolean, onCheckedChange = vi.fn(), disabled = false) {
  const element = Switch({ checked, label: 'Alternar preferência', disabled, onCheckedChange }) as ReactElement<SwitchElementProps>
  return { element, onCheckedChange }
}

describe('Switch', () => {
  it('expõe semântica acessível e alterna de OFF para ON', () => {
    const { element, onCheckedChange } = renderSwitch(false)

    expect(element.props).toMatchObject({
      role: 'switch',
      'aria-label': 'Alternar preferência',
      'aria-checked': false,
      disabled: false
    })
    element.props.onClick()
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('alterna de ON para OFF', () => {
    const { element, onCheckedChange } = renderSwitch(true)

    expect(element.props['aria-checked']).toBe(true)
    element.props.onClick()
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })

  it('preserva o estado e não chama onChange quando desabilitado', () => {
    const { element, onCheckedChange } = renderSwitch(true, vi.fn(), true)

    expect(element.props.disabled).toBe(true)
    expect(element.props['aria-checked']).toBe(true)
    element.props.onClick()
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
