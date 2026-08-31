import { createHmac } from 'node:crypto'

export const BRIDGE_HMAC_CONTEXT = 'auri-bridge-v1'

export function createBridgeProof(secret: Buffer, serverNonce: string, clientNonce: string): string {
  return createHmac('sha256', secret).update(`${BRIDGE_HMAC_CONTEXT}:${serverNonce}:${clientNonce}`).digest('base64')
}
