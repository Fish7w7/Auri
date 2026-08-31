import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BRIDGE_SECRET_BYTES, loadOrCreateBridgeIdentity, resolveBridgeEndpoint } from '@main/bridge/bridge-identity'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
describe('identidade do Desktop Bridge', () => {
  it('persiste secret de 256 bits fora do banco e separa DEV/produção', () => {
    const root = mkdtempSync(join(tmpdir(), 'auri-bridge-')); roots.push(root)
    const first = loadOrCreateBridgeIdentity(root, true); const second = loadOrCreateBridgeIdentity(root, true)
    expect(first.secret).toHaveLength(BRIDGE_SECRET_BYTES); expect(second.secret.equals(first.secret)).toBe(true)
    expect(first.secretPath).toBe(join(root, 'native-bridge', 'secret'))
    expect(resolveBridgeEndpoint(root, true, 'C:/Users/test')).toContain('auri-desktop-v1-')
    expect(resolveBridgeEndpoint(root, false, 'C:/Users/test')).toContain('auri-desktop-dev-v1-')
    expect(resolveBridgeEndpoint(root, true, 'C:/Users/test')).not.toBe(resolveBridgeEndpoint(root, false, 'C:/Users/test'))
  })
})
