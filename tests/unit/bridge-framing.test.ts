import { describe, expect, it } from 'vitest'
import { MAX_PROTOCOL_MESSAGE_BYTES } from '@auri/protocol'
import { BridgeFrameDecoder, BridgeFrameError, encodeBridgeFrame } from '@main/bridge/bridge-framing'

describe('framing do Desktop Bridge', () => {
  it('aceita prefixo/payload fragmentados e múltiplos frames no mesmo chunk', () => {
    const decoder = new BridgeFrameDecoder()
    const first = encodeBridgeFrame({ id: 1 }); const second = encodeBridgeFrame({ id: 2 })
    expect(decoder.push(first.subarray(0, 2))).toEqual([])
    expect(decoder.push(Buffer.concat([first.subarray(2), second]))).toEqual([{ id: 1 }, { id: 2 }])
    expect(decoder.hasPartialFrame).toBe(false)
  })

  it('detecta payload parcial, oversized e JSON inválido', () => {
    const partial = new BridgeFrameDecoder(); partial.push(encodeBridgeFrame({ value: true }).subarray(0, 7)); expect(partial.hasPartialFrame).toBe(true)
    const oversized = Buffer.alloc(4); oversized.writeUInt32LE(MAX_PROTOCOL_MESSAGE_BYTES + 1)
    expect(() => new BridgeFrameDecoder().push(oversized)).toThrow(BridgeFrameError)
    const invalid = Buffer.alloc(5); invalid.writeUInt32LE(1); invalid[4] = 0x7b
    expect(() => new BridgeFrameDecoder().push(invalid)).toThrow(BridgeFrameError)
  })
})
