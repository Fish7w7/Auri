import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { AssetService } from '@main/services/asset-service'
import { COVER_FAILURE_BACKOFF_MS, COVER_LIMITS, CoverService } from '@main/services/covers/cover-service'
import { ElectronCoverClient } from '@main/services/covers/electron-cover-client'
import type { CoverDownloadClient } from '@main/services/covers/types'
import { DomainError } from '@shared/errors/domain-error'
import { createDomainFixture } from '../helpers/domain-fixture'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })

vi.mock('electron', () => ({ net: { isOnline: () => true, fetch: vi.fn() } }))

async function setup(client: CoverDownloadClient, now: () => number = Date.now) {
  const fixture = createDomainFixture()
  const root = mkdtempSync(join(tmpdir(), 'auri-cover-cache-')); directories.push(root)
  const assets = new AssetService(join(root, 'assets'), fixture.services.works)
  const service = new CoverService(join(root, 'cache'), fixture.repositories.works, assets, client, now)
  const work = fixture.services.works.createWork({ title: 'Capa', mediaType: 'manga', userStatus: 'reading', cover: { type: 'remote', sourceUrl: 'https://img.example/cover.png' } })
  return { ...fixture, root, service, assets, work }
}

describe('CoverService', () => {
  it('bloqueia destino privado e redirect público para destino privado', async () => {
    const publicResolver = async () => ['93.184.216.34']
    let fetches = 0
    const privateClient = new ElectronCoverClient(publicResolver, async () => { fetches += 1; return new Response() }, () => true)
    await expect(privateClient.download('http://127.0.0.1/cover.png', { maxBytes: 1024, timeoutMs: 1000, maxRedirects: 2 }))
      .rejects.toMatchObject({ code: 'URL_DESTINATION_BLOCKED' })
    expect(fetches).toBe(0)

    const redirectClient = new ElectronCoverClient(publicResolver, async () => {
      fetches += 1
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private.png' } })
    }, () => true)
    await expect(redirectClient.download('https://images.example/cover.png', { maxBytes: 1024, timeoutMs: 1000, maxRedirects: 2 }))
      .rejects.toMatchObject({ code: 'URL_DESTINATION_BLOCKED' })
    expect(fetches).toBe(1)
  })

  it('aplica backoff de sessão e volta a tentar depois da janela', async () => {
    let now = 10_000
    let calls = 0
    const fixture = await setup({ isOnline: () => true, download: async () => { calls += 1; return Buffer.from('not-an-image') } }, () => now)
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'error' })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'error' })
    expect(calls).toBe(1)
    now += COVER_FAILURE_BACKOFF_MS + 1
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'error' })
    expect(calls).toBe(2)
    fixture.db.close()
  })

  it('gera preview remoto temporário sem persistir no cache', async () => {
    const image = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#7c5cff' } }).png().toBuffer()
    const fixture = await setup({ isOnline: () => true, download: async () => image })
    const preview = await fixture.service.previewRemoteCover({ url: 'https://img.example/preview.png' })
    expect(preview).toMatchObject({ state: 'ready', source: 'remote', cached: false })
    expect(fixture.service.getCacheUsage()).toMatchObject({ files: 0, bytes: 0 })
    const output = await sharp(Buffer.from(preview.dataUrl!.split(',')[1], 'base64')).metadata()
    expect(output).toMatchObject({ format: 'webp', width: 300, height: 450 })
    fixture.db.close()
  })

  it('gera WebP 300×450, usa cache e deduplica requisições concorrentes', async () => {
    const image = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#6c5ce7' } }).png().toBuffer()
    let calls = 0
    const fixture = await setup({ isOnline: () => true, download: async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return image } })
    const [first, second] = await Promise.all([fixture.service.getCover({ workId: fixture.work.id }), fixture.service.getCover({ workId: fixture.work.id })])
    expect(first.state).toBe('ready'); expect(second.dataUrl).toBe(first.dataUrl); expect(calls).toBe(1)
    await fixture.service.getCover({ workId: fixture.work.id }); expect(calls).toBe(1)
    const output = await sharp(Buffer.from(first.dataUrl!.split(',')[1], 'base64')).metadata()
    expect(output).toMatchObject({ format: 'webp', width: 300, height: 450 })
    fixture.db.close()
  })

  it('rejeita não-imagem e mantém estado de erro sem gravar cache', async () => {
    const fixture = await setup({ isOnline: () => true, download: async () => Buffer.from('<html>erro</html>') })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'error', dataUrl: null })
    expect(fixture.service.getCacheUsage()).toMatchObject({ files: 0, bytes: 0 })
    fixture.db.close()
  })

  it('não baixa offline e rejeita protocolo arbitrário e timeout', async () => {
    let calls = 0
    const offline = await setup({ isOnline: () => false, download: async () => { calls += 1; return Buffer.alloc(0) } })
    await expect(offline.service.getCover({ workId: offline.work.id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(0)
    expect(() => offline.service.prepareRemoteCover(offline.work.id, 'file:///tmp/cover.png')).toThrow('Protocolo')
    expect(() => offline.service.prepareRemoteCover(offline.work.id, 'not-a-url')).toThrow('URL')
    offline.db.close()

    const timeout = await setup({ isOnline: () => true, download: async () => { throw new DomainError('COVER_TIMEOUT', 'timeout') } })
    await expect(timeout.service.getCover({ workId: timeout.work.id })).resolves.toMatchObject({ state: 'error' })
    timeout.db.close()
  })

  it('respeita limite e preserva cache anterior em falha de refresh', async () => {
    const image = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#222222' } }).png().toBuffer()
    let valid = true
    let calls = 0
    const fixture = await setup({ isOnline: () => true, download: async () => { calls += 1; return valid ? image : Buffer.alloc(COVER_LIMITS.maxBytes + 1) } })
    const before = await fixture.service.getCover({ workId: fixture.work.id })
    valid = false
    const after = await fixture.service.refreshCover({ workId: fixture.work.id })
    expect(after.state).toBe('ready'); expect(after.dataUrl).toBe(before.dataUrl)
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'ready', cached: true })
    expect(calls).toBe(2)
    fixture.db.close()
  })

  it('limpa apenas cache remoto e preserva capa customizada permanente', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer()
    const fixture = await setup({ isOnline: () => true, download: async () => image })
    await fixture.service.getCover({ workId: fixture.work.id })
    const customFile = join(fixture.root, 'custom.png'); writeFileSync(customFile, image)
    const custom = fixture.services.works.createWork({ title: 'Custom', mediaType: 'manga', userStatus: 'reading' })
    const updated = fixture.assets.importCustomCover(custom.id, customFile); unlinkSync(customFile)
    await fixture.service.clearAllCache()
    expect(fixture.service.getCacheUsage().files).toBe(0)
    expect(updated.cover.customPath && existsSync(join(fixture.root, 'assets', ...updated.cover.customPath.split('/')))).toBe(true)
    await expect(fixture.service.getCover({ workId: custom.id })).resolves.toMatchObject({ state: 'ready', source: 'custom' })
    fixture.db.close()
  })

  it('aguarda jobs em andamento antes de limpar o cache', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#ffffff' } }).png().toBuffer()
    let releaseDownload!: () => void
    const downloadReady = new Promise<void>((resolve) => { releaseDownload = resolve })
    const fixture = await setup({ isOnline: () => true, download: async () => { await downloadReady; return image } })
    const cover = fixture.service.getCover({ workId: fixture.work.id })
    const clearing = fixture.service.clearAllCache()
    releaseDownload()
    await expect(cover).resolves.toMatchObject({ state: 'ready' })
    await expect(clearing).resolves.toMatchObject({ files: 0, bytes: 0, queue: 0, active: 0 })
    fixture.db.close()
  })
})
