import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { CoverCacheUsage, CoverResult } from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { coverPreviewSchema, coverWorkSchema } from '@shared/schemas/domain'
import type { WorkRepository } from '../../database/repositories/work-repository'
import type { AssetService } from '../asset-service'
import { parseDomainInput } from '../service-utils'
import type { CoverDownloadClient, PreparedCover } from './types'

export const COVER_LIMITS = { maxBytes: 10 * 1024 * 1024, timeoutMs: 15_000, maxPixels: 60_000_000, maxDimension: 12_000, width: 300, height: 450, quality: 80, concurrency: 4 } as const

interface QueueJob { key: string; run(): Promise<PreparedCover>; resolve(value: PreparedCover): void; reject(error: unknown): void }

export class CoverService {
  private readonly queue: QueueJob[] = []
  private readonly inflight = new Map<string, Promise<PreparedCover>>()
  private active = 0
  private maintenance: Promise<void> | null = null

  constructor(private readonly cacheDirectory: string, private readonly works: WorkRepository, private readonly assets: AssetService, private readonly client: CoverDownloadClient) {
    mkdirSync(cacheDirectory, { recursive: true })
  }

  async getCover(input: unknown): Promise<CoverResult> {
    const { workId } = parseDomainInput(coverWorkSchema, input)
    const work = this.works.findById(workId)
    if (!work || work.deletedAt) return { state: 'placeholder', dataUrl: null, source: 'none', cached: false }
    if (work.cover.type === 'custom') {
      const dataUrl = this.assets.readCover({ workId })
      return dataUrl ? { state: 'ready', dataUrl, source: 'custom', cached: true } : { state: 'error', dataUrl: null, source: 'custom', cached: false }
    }
    if (work.cover.type !== 'remote' || !work.cover.sourceUrl) return { state: 'placeholder', dataUrl: null, source: 'none', cached: false }
    const cacheExists = existsSync(this.cachePath(workId))
    const currentSource = this.readCacheSource(workId)
    if (cacheExists && currentSource === work.cover.sourceUrl) return this.cachedResult(workId)
    if (!this.client.isOnline()) return cacheExists ? this.cachedResult(workId) : { state: 'placeholder', dataUrl: null, source: 'none', cached: false }
    try {
      const prepared = await this.enqueue(workId, work.cover.sourceUrl)
      if (!existsSync(this.cachePath(workId)) || this.readCacheSource(workId) !== work.cover.sourceUrl) this.commitPrepared(prepared)
      return this.cachedResult(workId)
    } catch {
      return cacheExists ? this.cachedResult(workId) : { state: 'error', dataUrl: null, source: 'cache', cached: false }
    }
  }

  async refreshCover(input: unknown): Promise<CoverResult> {
    const { workId } = parseDomainInput(coverWorkSchema, input)
    const work = this.works.findById(workId)
    if (!work || work.cover.type !== 'remote' || !work.cover.sourceUrl) return { state: 'placeholder', dataUrl: null, source: 'none', cached: false }
    const oldExists = existsSync(this.cachePath(workId))
    try { const prepared = await this.enqueue(workId, work.cover.sourceUrl, true); if (existsSync(prepared.temporaryPath)) this.commitPrepared(prepared); return this.cachedResult(workId) }
    catch { return oldExists ? this.cachedResult(workId) : { state: 'error', dataUrl: null, source: 'cache', cached: false } }
  }

  async previewRemoteCover(input: unknown): Promise<CoverResult> {
    const { url } = parseDomainInput(coverPreviewSchema, input)
    let temporaryPath: string | null = null
    try {
      const prepared = await this.enqueue(`__url-preview__-${randomUUID()}`, url, true)
      temporaryPath = prepared.temporaryPath
      const data = readFileSync(temporaryPath)
      return { state: 'ready', dataUrl: `data:image/webp;base64,${data.toString('base64')}`, source: 'remote', cached: false }
    } catch {
      return { state: 'error', dataUrl: null, source: 'remote', cached: false }
    } finally { if (temporaryPath) this.removeIfExists(temporaryPath) }
  }

  prepareRemoteCover(workId: string, sourceUrl: string): Promise<PreparedCover> { return this.enqueue(workId, sourceUrl, true) }

  commitPrepared(prepared: PreparedCover): void {
    const target = this.cachePath(prepared.workId)
    const metadata = this.metadataPath(prepared.workId)
    const backup = `${target}.bak`
    try {
      if (existsSync(backup)) unlinkSync(backup)
      if (existsSync(target)) renameSync(target, backup)
      renameSync(prepared.temporaryPath, target)
      writeFileSync(`${metadata}.tmp`, JSON.stringify({ sourceUrl: prepared.sourceUrl }), 'utf8')
      if (existsSync(metadata)) unlinkSync(metadata)
      renameSync(`${metadata}.tmp`, metadata)
      if (existsSync(backup)) unlinkSync(backup)
    } catch (error) {
      if (existsSync(target)) unlinkSync(target)
      if (existsSync(backup)) renameSync(backup, target)
      this.removeIfExists(`${metadata}.tmp`)
      throw error
    }
  }

  clearWorkCache(input: unknown): void { const { workId } = parseDomainInput(coverWorkSchema, input); this.removeIfExists(this.cachePath(workId)); this.removeIfExists(this.metadataPath(workId)) }
  async clearAllCache(): Promise<CoverCacheUsage> {
    if (this.maintenance) {
      await this.maintenance
      return this.getCacheUsage()
    }
    const maintenance = this.waitUntilIdle().then(() => {
      for (const entry of readdirSync(this.cacheDirectory)) if (/\.(webp|json|tmp|bak)$/i.test(entry)) this.removeIfExists(join(this.cacheDirectory, entry))
    })
    this.maintenance = maintenance
    try { await maintenance } finally { if (this.maintenance === maintenance) this.maintenance = null }
    return this.getCacheUsage()
  }
  getCacheUsage(): CoverCacheUsage {
    let files = 0; let bytes = 0
    for (const entry of readdirSync(this.cacheDirectory)) if (entry.endsWith('.webp')) { files += 1; bytes += statSync(join(this.cacheDirectory, entry)).size }
    return { files, bytes, queue: this.queue.length, active: this.active }
  }

  private enqueue(workId: string, sourceUrl: string, force = false): Promise<PreparedCover> {
    if (this.maintenance) return this.maintenance.then(() => this.enqueue(workId, sourceUrl, force))
    this.validateUrl(sourceUrl)
    const key = `${workId}:${sourceUrl}`
    const existing = this.inflight.get(key)
    if (existing) return existing
    const promise = new Promise<PreparedCover>((resolve, reject) => this.queue.push({ key, run: () => this.downloadAndProcess(workId, sourceUrl), resolve, reject }))
    this.inflight.set(key, promise)
    void promise.finally(() => this.inflight.delete(key)).catch(() => undefined)
    this.pump()
    return promise
  }

  private pump(): void {
    while (this.active < COVER_LIMITS.concurrency && this.queue.length) {
      const job = this.queue.shift()!
      this.active += 1
      void job.run().then(job.resolve, job.reject).finally(() => { this.active -= 1; this.pump() })
    }
  }

  private async downloadAndProcess(workId: string, sourceUrl: string): Promise<PreparedCover> {
    if (!this.client.isOnline()) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A capa não está disponível offline.')
    const bytes = await this.client.download(sourceUrl, { maxBytes: COVER_LIMITS.maxBytes, timeoutMs: COVER_LIMITS.timeoutMs })
    if (bytes.byteLength > COVER_LIMITS.maxBytes) throw new DomainError('COVER_TOO_LARGE', 'A capa remota excede o limite permitido.')
    let pipeline
    try {
      pipeline = sharp(bytes, { failOn: 'error', limitInputPixels: COVER_LIMITS.maxPixels })
      const metadata = await pipeline.metadata()
      if (!metadata.format || !['jpeg', 'png', 'webp', 'gif'].includes(metadata.format) || !metadata.width || !metadata.height || metadata.width > COVER_LIMITS.maxDimension || metadata.height > COVER_LIMITS.maxDimension) throw new Error('unsupported')
    } catch { throw new DomainError('COVER_INVALID_IMAGE', 'A resposta não contém uma imagem suportada.') }
    const output = await pipeline.rotate().resize({ width: COVER_LIMITS.width, height: COVER_LIMITS.height, fit: 'cover' }).webp({ quality: COVER_LIMITS.quality }).toBuffer()
    if (output.subarray(0, 4).toString('ascii') !== 'RIFF' || output.subarray(8, 12).toString('ascii') !== 'WEBP') throw new DomainError('COVER_INVALID_IMAGE', 'Não foi possível gerar a thumbnail.')
    const temporaryPath = join(this.cacheDirectory, `${workId}.${randomUUID()}.tmp`)
    writeFileSync(temporaryPath, output)
    return { workId, sourceUrl, temporaryPath }
  }

  private validateUrl(value: string): void { let url: URL; try { url = new URL(value) } catch { throw new DomainError('COVER_DOWNLOAD_FAILED', 'URL de capa inválida.') }; if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new DomainError('COVER_DOWNLOAD_FAILED', 'Protocolo de capa não permitido.') }
  private cachePath(workId: string): string { return join(this.cacheDirectory, `${workId}.webp`) }
  private metadataPath(workId: string): string { return join(this.cacheDirectory, `${workId}.json`) }
  private readCacheSource(workId: string): string | null { try { return (JSON.parse(readFileSync(this.metadataPath(workId), 'utf8')) as { sourceUrl?: string }).sourceUrl ?? null } catch { return null } }
  private cachedResult(workId: string): CoverResult { return { state: 'ready', dataUrl: `data:image/webp;base64,${readFileSync(this.cachePath(workId)).toString('base64')}`, source: 'cache', cached: true } }
  private removeIfExists(path: string): void { if (existsSync(path)) rmSync(path, { force: true }) }
  private async waitUntilIdle(): Promise<void> {
    while (this.active > 0 || this.queue.length > 0) await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
