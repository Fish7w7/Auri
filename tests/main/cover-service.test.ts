import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { AssetService } from '@main/services/asset-service'
import { COVER_CIRCUIT_BREAKER, COVER_FAILURE_BACKOFF_MS, COVER_LIMITS, CoverService } from '@main/services/covers/cover-service'
import { ElectronCoverClient } from '@main/services/covers/electron-cover-client'
import type { CoverDownloadClient } from '@main/services/covers/types'
import { DomainError } from '@shared/errors/domain-error'
import { createDomainFixture } from '../fixtures/domain-fixture'

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

type CoverFixture = Awaited<ReturnType<typeof setup>>

function addRemoteWork(fixture: CoverFixture, title: string, sourceUrl: string) {
  return fixture.services.works.createWork({ title, mediaType: 'manga', userStatus: 'reading', cover: { type: 'remote', sourceUrl } })
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

  it('começa fechado e uma falha transitória isolada não bloqueia o domínio', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#111111' } }).png().toBuffer()
    let calls = 0
    const fixture = await setup({
      isOnline: () => true,
      download: async (url) => {
        calls += 1
        if (url.endsWith('/cover.png')) throw new DomainError('COVER_TIMEOUT', 'timeout')
        return image
      }
    })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'error' })
    const recovered = addRemoteWork(fixture, 'Recuperada', 'https://img.example/recovered.png')
    await expect(fixture.service.getCover({ workId: recovered.id })).resolves.toMatchObject({ state: 'ready' })
    expect(calls).toBe(2)
    fixture.db.close()
  })

  it('abre no threshold, compartilha hostname e mantém domínios independentes', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#222222' } }).png().toBuffer()
    let calls = 0
    const fixture = await setup({
      isOnline: () => true,
      download: async (url) => {
        calls += 1
        if (new URL(url).hostname === 'broken.example') throw new DomainError('COVER_TIMEOUT', 'timeout')
        return image
      }
    })
    const broken = ['a', 'b', 'c', 'd'].map((name) => addRemoteWork(fixture, name, `https://broken.example/${name}.png`))
    for (const work of broken.slice(0, 3)) await fixture.service.getCover({ workId: work.id })
    await expect(fixture.service.getCover({ workId: broken[3].id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(3)

    const independent = addRemoteWork(fixture, 'Outro CDN', 'https://healthy.example/cover.png')
    await expect(fixture.service.getCover({ workId: independent.id })).resolves.toMatchObject({ state: 'ready' })
    expect(calls).toBe(4)
    fixture.db.close()
  })

  it('não acumula falhas que ficaram fora da janela', async () => {
    let now = 1_000
    let calls = 0
    const fixture = await setup({ isOnline: () => true, download: async () => { calls += 1; throw new DomainError('COVER_TIMEOUT', 'timeout') } }, () => now)
    const works = ['a', 'b', 'c', 'd'].map((name) => addRemoteWork(fixture, name, `https://slow.example/${name}.png`))
    for (const work of works.slice(0, 3)) {
      await fixture.service.getCover({ workId: work.id })
      now += COVER_CIRCUIT_BREAKER.failureWindowMs + 1
    }
    await fixture.service.getCover({ workId: works[3].id })
    expect(calls).toBe(4)
    fixture.db.close()
  })

  it('não conta HTTP 404 nem bloqueio de segurança como falha do domínio', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#333333' } }).png().toBuffer()
    let calls = 0
    const fixture = await setup({
      isOnline: () => true,
      download: async (url) => {
        calls += 1
        if (url.includes('/404-')) throw new DomainError('COVER_DOWNLOAD_FAILED', 'not found', { httpStatus: 404, transient: false })
        if (url.includes('/blocked-')) throw new DomainError('URL_DESTINATION_BLOCKED', 'blocked')
        return image
      }
    })
    const failures = [
      ...['1', '2', '3'].map((id) => addRemoteWork(fixture, `404 ${id}`, `https://mixed.example/404-${id}.png`)),
      ...['1', '2', '3'].map((id) => addRemoteWork(fixture, `Bloqueada ${id}`, `https://mixed.example/blocked-${id}.png`))
    ]
    for (const work of failures) await fixture.service.getCover({ workId: work.id })
    const healthy = addRemoteWork(fixture, 'Saudável', 'https://mixed.example/healthy.png')
    await expect(fixture.service.getCover({ workId: healthy.id })).resolves.toMatchObject({ state: 'ready' })
    expect(calls).toBe(7)
    fixture.db.close()
  })

  it.each([429, 503])('conta HTTP %i como falha transitória do domínio', async (httpStatus) => {
    let calls = 0
    const fixture = await setup({
      isOnline: () => true,
      download: async () => {
        calls += 1
        throw new DomainError('COVER_DOWNLOAD_FAILED', 'temporarily unavailable', { httpStatus, transient: true })
      }
    })
    const works = ['a', 'b', 'c', 'd'].map((name) => addRemoteWork(fixture, name, `https://http-failure.example/${name}.png`))
    for (const work of works.slice(0, 3)) await fixture.service.getCover({ workId: work.id })
    await expect(fixture.service.getCover({ workId: works[3].id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(3)
    fixture.db.close()
  })

  it('mantém cache válido disponível enquanto o domínio está aberto', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#444444' } }).png().toBuffer()
    let failing = false
    let calls = 0
    const fixture = await setup({ isOnline: () => true, download: async () => { calls += 1; if (failing) throw new DomainError('COVER_TIMEOUT', 'timeout'); return image } })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'ready' })
    failing = true
    const failures = ['a', 'b', 'c'].map((name) => addRemoteWork(fixture, name, `https://img.example/${name}.png`))
    for (const work of failures) await fixture.service.getCover({ workId: work.id })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'ready', cached: true })
    expect(calls).toBe(4)
    fixture.db.close()
  })

  it('mantém cache como prioridade quando a máquina fica offline', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#454545' } }).png().toBuffer()
    let online = true
    let calls = 0
    const fixture = await setup({ isOnline: () => online, download: async () => { calls += 1; return image } })
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'ready', cached: true })
    online = false
    await expect(fixture.service.getCover({ workId: fixture.work.id })).resolves.toMatchObject({ state: 'ready', cached: true })
    expect(calls).toBe(1)
    fixture.db.close()
  })

  it('offline conhecido não baixa, não cria backoff e não alimenta o circuito', async () => {
    let online = false
    let calls = 0
    const fixture = await setup({
      isOnline: () => online,
      download: async () => { calls += 1; throw new DomainError('COVER_TIMEOUT', 'timeout') }
    })
    const works = ['a', 'b', 'c', 'd'].map((name) => addRemoteWork(fixture, name, `https://offline-cdn.example/${name}.png`))
    for (const work of works) await expect(fixture.service.getCover({ workId: work.id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(0)

    online = true
    for (const work of works.slice(0, 3)) await expect(fixture.service.getCover({ workId: work.id })).resolves.toMatchObject({ state: 'error' })
    await expect(fixture.service.getCover({ workId: works[3].id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(3)
    fixture.db.close()
  })

  it('permite somente uma probe HALF_OPEN e fecha após sucesso', async () => {
    const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: '#555555' } }).png().toBuffer()
    let now = 1_000
    let calls = 0
    let probe = false
    let resolveProbe!: (value: Buffer) => void
    const probeResult = new Promise<Buffer>((resolve) => { resolveProbe = resolve })
    const fixture = await setup({
      isOnline: () => true,
      download: async () => {
        calls += 1
        if (probe) return probeResult
        throw new DomainError('COVER_TIMEOUT', 'timeout')
      }
    }, () => now)
    const failures = ['a', 'b', 'c'].map((name) => addRemoteWork(fixture, name, `https://probe.example/${name}.png`))
    for (const work of failures) await fixture.service.getCover({ workId: work.id })
    now += COVER_CIRCUIT_BREAKER.openDurationMs + 1
    probe = true
    const firstProbe = addRemoteWork(fixture, 'Probe A', 'https://probe.example/probe-a.png')
    const blockedProbe = addRemoteWork(fixture, 'Probe B', 'https://probe.example/probe-b.png')
    const first = fixture.service.getCover({ workId: firstProbe.id })
    await expect(fixture.service.getCover({ workId: blockedProbe.id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(4)
    resolveProbe(image)
    await expect(first).resolves.toMatchObject({ state: 'ready' })

    const afterClose = addRemoteWork(fixture, 'Após fechar', 'https://probe.example/after.png')
    await expect(fixture.service.getCover({ workId: afterClose.id })).resolves.toMatchObject({ state: 'ready' })
    expect(calls).toBe(5)
    fixture.db.close()
  })

  it('reabre após falha transitória da probe e respeita também o backoff por URL', async () => {
    let now = 1_000
    let calls = 0
    let recovering = false
    const fixture = await setup({
      isOnline: () => true,
      download: async () => {
        calls += 1
        if (recovering) return sharp({ create: { width: 20, height: 30, channels: 3, background: '#666666' } }).png().toBuffer()
        throw new DomainError('COVER_TIMEOUT', 'timeout')
      }
    }, () => now)
    const first = addRemoteWork(fixture, 'A', 'https://retry-cdn.example/a.png')
    await fixture.service.getCover({ workId: first.id })
    await fixture.service.getCover({ workId: first.id })
    expect(calls).toBe(1)
    for (const name of ['b', 'c']) {
      const work = addRemoteWork(fixture, name, `https://retry-cdn.example/${name}.png`)
      await fixture.service.getCover({ workId: work.id })
    }
    expect(calls).toBe(3)

    now += COVER_CIRCUIT_BREAKER.openDurationMs + 1
    const failedProbe = addRemoteWork(fixture, 'Probe falha', 'https://retry-cdn.example/probe.png')
    await fixture.service.getCover({ workId: failedProbe.id })
    const stillOpen = addRemoteWork(fixture, 'Ainda aberto', 'https://retry-cdn.example/open.png')
    await expect(fixture.service.getCover({ workId: stillOpen.id })).resolves.toMatchObject({ state: 'placeholder' })
    expect(calls).toBe(4)

    now += COVER_CIRCUIT_BREAKER.openDurationMs + 1
    recovering = true
    const recovered = addRemoteWork(fixture, 'Recuperada', 'https://retry-cdn.example/recovered.png')
    await expect(fixture.service.getCover({ workId: recovered.id })).resolves.toMatchObject({ state: 'ready' })
    expect(calls).toBe(5)
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
