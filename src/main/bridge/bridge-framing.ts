import { MAX_PROTOCOL_MESSAGE_BYTES } from '@auri/protocol'

export class BridgeFrameError extends Error {}

export function encodeBridgeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  if (payload.length > MAX_PROTOCOL_MESSAGE_BYTES) throw new BridgeFrameError('Mensagem excede o limite do protocolo.')
  const frame = Buffer.allocUnsafe(4 + payload.length)
  frame.writeUInt32LE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

export class BridgeFrameDecoder {
  private buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0)

  push(chunk: Buffer): unknown[] {
    this.buffered = this.buffered.length ? Buffer.concat([this.buffered, chunk]) : chunk
    const messages: unknown[] = []
    while (this.buffered.length >= 4) {
      const length = this.buffered.readUInt32LE(0)
      if (length > MAX_PROTOCOL_MESSAGE_BYTES) throw new BridgeFrameError('Frame anunciado excede o limite do protocolo.')
      if (this.buffered.length < length + 4) break
      const payload = this.buffered.subarray(4, length + 4)
      this.buffered = this.buffered.subarray(length + 4)
      try { messages.push(JSON.parse(payload.toString('utf8')) as unknown) }
      catch { throw new BridgeFrameError('JSON inválido.') }
    }
    return messages
  }

  get hasPartialFrame(): boolean { return this.buffered.length > 0 }
}
