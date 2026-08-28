import { describe, expect, it } from 'vitest'
import { calculateSelectPlacement } from '@renderer/components/ui/Select'

describe('posicionamento do Select', () => {
  it('abre acima quando o espaço inferior do container cortaria a lista', () => {
    expect(calculateSelectPlacement({ triggerTop: 400, triggerBottom: 440, boundaryTop: 100, boundaryBottom: 500, optionCount: 4 })).toEqual({ above: true, maxHeight: 260 })
  })

  it('limita a altura ao espaço visível quando nenhuma direção comporta a lista inteira', () => {
    expect(calculateSelectPlacement({ triggerTop: 300, triggerBottom: 340, boundaryTop: 250, boundaryBottom: 420, optionCount: 6 })).toEqual({ above: false, maxHeight: 75 })
  })
})
