import { describe, expect, it } from 'vitest'
import { MAX_PROTOCOL_MESSAGE_BYTES } from '@auri/protocol'
import { encodeLengthPrefixedJson, LengthPrefixedFrameError, LengthPrefixedJsonDecoder } from '@shared/native-bridge/framing'

describe('framing do Native Messaging', () => {
  it('recompõe prefixo e payload fragmentados e extrai vários frames', () => {
    const decoder = new LengthPrefixedJsonDecoder()
    const first = encodeLengthPrefixedJson({ id: 'first' })
    const second = encodeLengthPrefixedJson({ id: 'second' })
    expect(decoder.push(first.subarray(0, 1))).toEqual([])
    expect(decoder.push(first.subarray(1, 6))).toEqual([])
    expect(decoder.push(Buffer.concat([first.subarray(6), second]))).toEqual([{ id: 'first' }, { id: 'second' }])
    expect(decoder.hasPartialFrame).toBe(false)
  })

  it('mantém EOF parcial detectável e rejeita zero, oversized e JSON inválido', () => {
    const partial = new LengthPrefixedJsonDecoder()
    partial.push(encodeLengthPrefixedJson({ ok: true }).subarray(0, 5))
    expect(partial.hasPartialFrame).toBe(true)

    const zero = Buffer.alloc(4)
    expect(() => new LengthPrefixedJsonDecoder().push(zero)).toThrow(LengthPrefixedFrameError)
    const oversized = Buffer.alloc(4)
    oversized.writeUInt32LE(MAX_PROTOCOL_MESSAGE_BYTES + 1)
    expect(() => new LengthPrefixedJsonDecoder().push(oversized)).toThrow(LengthPrefixedFrameError)
    const invalid = Buffer.from([1, 0, 0, 0, 0x7b])
    expect(() => new LengthPrefixedJsonDecoder().push(invalid)).toThrow(LengthPrefixedFrameError)
  })
})

