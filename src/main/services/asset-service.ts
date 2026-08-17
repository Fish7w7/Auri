import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import type { Work } from '@shared/types/domain'
import { DomainError } from '@shared/errors/domain-error'
import { remoteCoverSchema, workIdSchema } from '@shared/schemas/domain'
import type { WorkService } from './work-service'
import { generateId, parseDomainInput, type IdGenerator } from './service-utils'

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MIME_BY_EXTENSION: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

export class AssetService {
  private readonly customCoversDirectory: string

  constructor(private readonly assetsRoot: string, private readonly works: WorkService, private readonly idGenerator: IdGenerator = generateId) {
    this.customCoversDirectory = join(assetsRoot, 'covers', 'custom')
    mkdirSync(this.customCoversDirectory, { recursive: true })
  }

  importCustomCover(workId: string, sourcePath: string): Work {
    const current = this.works.getWork({ workId })
    const extension = extname(sourcePath).toLocaleLowerCase('en-US')
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new DomainError('INVALID_INPUT', 'Escolha uma imagem PNG, JPG, JPEG ou WebP.')
    if (!existsSync(sourcePath) || statSync(sourcePath).size > 15 * 1024 * 1024) throw new DomainError('INVALID_INPUT', 'A imagem não existe ou excede 15 MB.')
    const filename = `${this.idGenerator()}${extension}`
    const destination = join(this.customCoversDirectory, filename)
    const controlledPath = ['covers', 'custom', filename].join('/')
    copyFileSync(sourcePath, destination)
    try {
      const updated = this.works.updateWork({ id: workId, cover: { type: 'custom', sourceUrl: null, customPath: controlledPath } })
      if (current.cover.type === 'custom' && current.cover.customPath !== controlledPath) this.removeControlledFile(current.cover.customPath)
      return updated
    } catch (error) {
      if (existsSync(destination)) unlinkSync(destination)
      throw error
    }
  }

  setRemoteCover(input: unknown): Work {
    const { workId, url } = parseDomainInput(remoteCoverSchema, input)
    const current = this.works.getWork({ workId })
    const updated = this.works.updateWork({ id: workId, cover: { type: 'remote', sourceUrl: url, customPath: null } })
    if (current.cover.type === 'custom') this.removeControlledFile(current.cover.customPath)
    return updated
  }

  removeCover(input: unknown): Work {
    const { workId } = parseDomainInput(workIdSchema, input)
    const current = this.works.getWork({ workId })
    const updated = this.works.updateWork({ id: workId, cover: { type: 'none', sourceUrl: null, customPath: null } })
    if (current.cover.type === 'custom') this.removeControlledFile(current.cover.customPath)
    return updated
  }

  readCover(input: unknown): string | null {
    const { workId } = parseDomainInput(workIdSchema, input)
    const work = this.works.getWork({ workId })
    if (work.cover.type !== 'custom' || !work.cover.customPath) return null
    const path = this.resolveControlledPath(work.cover.customPath)
    if (!path || !existsSync(path)) return null
    const extension = extname(path).toLocaleLowerCase('en-US')
    const mime = MIME_BY_EXTENSION[extension]
    if (!mime) return null
    return `data:${mime};base64,${readFileSync(path).toString('base64')}`
  }

  private resolveControlledPath(controlledPath: string): string | null {
    const absolute = resolve(this.assetsRoot, controlledPath)
    const relation = relative(resolve(this.assetsRoot), absolute)
    if (!relation || relation.startsWith('..') || resolve(this.assetsRoot) === absolute) return null
    return absolute
  }

  private removeControlledFile(controlledPath: string | null): void {
    if (!controlledPath) return
    const path = this.resolveControlledPath(controlledPath)
    if (path && existsSync(path)) {
      try { unlinkSync(path) } catch { /* A referência já foi persistida; o asset órfão pode ser limpo futuramente. */ }
    }
  }
}
