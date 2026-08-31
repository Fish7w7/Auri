import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@auri/protocol'
import { DesktopConnector, resolveInstalledAuriExecutable } from '../../src/native-host/desktop-connector'
import type { NativeHostLog } from '../../src/native-host/host-logger'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const logger: NativeHostLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('startup do Desktop pelo Native Host', () => {
  it('localiza Auri.exe acima de resources/native-host', () => {
    const root = temporaryRoot(); const host = join(root, 'resources', 'native-host', 'AuriNativeHost.exe'); const desktop = join(root, 'Auri.exe')
    mkdirSync(join(root, 'resources', 'native-host'), { recursive: true }); writeFileSync(host, ''); writeFileSync(desktop, '')
    expect(resolveInstalledAuriExecutable(host)).toBe(desktop)
  })

  it('em produção tenta iniciar o Desktop no máximo uma vez e falha de forma segura', async () => {
    const root = temporaryRoot(); const host = join(root, 'resources', 'native-host', 'AuriNativeHost.exe'); const desktop = join(root, 'Auri.exe')
    mkdirSync(join(root, 'resources', 'native-host'), { recursive: true }); writeFileSync(host, ''); writeFileSync(desktop, '')
    const startDesktop = vi.fn()
    const connector = new DesktopConnector({ development: false, appDataPath: join(root, 'appdata'), hostExecutable: host, logger, startupTimeoutMs: 30, startDesktop })
    const request = createRequest('hello', 'system.hello', { client: { kind: 'native-host', name: 'test', version: '1.10.0' }, supportedProtocolVersions: [1] })
    await expect(connector.forward(request)).rejects.toThrow()
    await expect(connector.forward(request)).rejects.toThrow()
    expect(startDesktop).toHaveBeenCalledTimes(1)
    expect(startDesktop).toHaveBeenCalledWith(desktop)
  })

  it('em desenvolvimento nunca inicia processos quando o Desktop está ausente', async () => {
    const root = temporaryRoot(); const startDesktop = vi.fn()
    const connector = new DesktopConnector({ development: true, appDataPath: join(root, 'appdata'), hostExecutable: join(root, 'AuriNativeHost.exe'), logger, startupTimeoutMs: 20, startDesktop })
    const request = createRequest('hello', 'system.hello', { client: { kind: 'native-host', name: 'test', version: '1.10.0' }, supportedProtocolVersions: [1] })
    await expect(connector.forward(request)).rejects.toThrow()
    expect(startDesktop).not.toHaveBeenCalled()
  })
})

function temporaryRoot(): string { const path = join(tmpdir(), `auri-native-host-${randomUUID()}`); roots.push(path); mkdirSync(path, { recursive: true }); return path }

