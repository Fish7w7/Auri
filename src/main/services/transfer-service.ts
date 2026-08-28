import { randomUUID } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type {
  ImportPreview, ImportResult, ImportStrategy, AuriExportWork, AuriLibraryExport, WorkDetails
} from '@shared/contracts'
import { DomainError } from '@shared/errors/domain-error'
import { APP_BRAND } from '@shared/constants/app-branding'
import type { Alias, Collection, Creator, ExternalRef, Genre, ReadingHistory, Source, Tag, Work } from '@shared/types/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import type { AliasRepository } from '../database/repositories/alias-repository'
import type { CollectionRepository } from '../database/repositories/collection-repository'
import type { CreatorRepository } from '../database/repositories/creator-repository'
import type { ExternalRefRepository } from '../database/repositories/external-ref-repository'
import type { GenreRepository } from '../database/repositories/genre-repository'
import type { HistoryRepository } from '../database/repositories/history-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { TagRepository } from '../database/repositories/tag-repository'
import type { WorkRepository } from '../database/repositories/work-repository'
import type { WorkDetailsService } from './work-details-service'
import type { BackupService } from './backup/backup-service'
import type { Logger } from '../logging/logger'

const MAX_IMPORT_BYTES = 100 * 1024 * 1024
const exportedWorkSchema = z.object({
  work: z.object({
    id: z.string(), title: z.string().min(1), normalizedTitle: z.string(),
    mediaType: z.enum(['manhwa', 'manga', 'manhua', 'webtoon', 'novel', 'light_novel', 'other']),
    userStatus: z.enum(['want_to_read', 'reading', 'paused', 'waiting', 'completed', 'dropped']),
    publicationStatus: z.enum(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']).nullable(),
    description: z.string().nullable(), countryCode: z.string().nullable(), startDate: z.string().nullable(), endDate: z.string().nullable(),
    lastReadChapter: z.object({ label: z.string(), number: z.number().nullable() }).nullable(), lastReadAt: z.string().nullable(),
    rating: z.number().nullable(), favorite: z.boolean(), hiddenFromHome: z.boolean().default(false), notes: z.string().nullable(), lastReadNote: z.string().nullable(),
    cover: z.object({ type: z.enum(['none', 'remote', 'custom']), sourceUrl: z.string().nullable(), customPath: z.string().nullable(), updatedAt: z.string().nullable() }),
    metadataUpdatedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), deletedAt: z.string().nullable()
  }),
  aliases: z.array(z.object({ id: z.string(), workId: z.string(), name: z.string(), normalizedName: z.string(), kind: z.string().nullable(), source: z.string().nullable(), createdAt: z.string() })),
  creators: z.array(z.object({ id: z.string(), workId: z.string(), name: z.string(), normalizedName: z.string(), role: z.string(), source: z.string().nullable(), createdAt: z.string() })),
  genres: z.array(z.object({ id: z.string(), name: z.string(), normalizedName: z.string() })),
  tags: z.array(z.object({ id: z.string(), name: z.string(), normalizedName: z.string(), createdAt: z.string() })),
  collections: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() })),
  sources: z.array(z.object({ id: z.string(), workId: z.string(), name: z.string().nullable(), domain: z.string(), language: z.string().nullable(), seriesUrl: z.string().nullable(), lastReadUrl: z.string().nullable(), translatorGroup: z.string().nullable(), status: z.enum(['active', 'unavailable', 'archived']), isPreferred: z.boolean(), lastUsedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() })),
  history: z.array(z.object({ id: z.string(), workId: z.string(), sourceId: z.string().nullable(), eventType: z.enum(['initial_progress', 'progress_update', 'correction', 'undo']), oldChapter: z.object({ label: z.string(), number: z.number().nullable() }).nullable(), newChapter: z.object({ label: z.string(), number: z.number().nullable() }).nullable(), sourceNameSnapshot: z.string().nullable(), sourceDomainSnapshot: z.string().nullable(), note: z.string().nullable(), revertsHistoryId: z.string().nullable(), occurredAt: z.string(), createdAt: z.string() })),
  externalRefs: z.array(z.object({ id: z.string(), workId: z.string(), provider: z.string(), externalId: z.string(), canonicalUrl: z.string().nullable(), lastSyncedAt: z.string().nullable(), createdAt: z.string() }))
})
const libraryExportSchema = z.object({ format: z.literal('auri-library'), version: z.literal(1), exportedAt: z.string(), works: z.array(exportedWorkSchema).max(100_000) })

export interface TransferRepositories {
  works: WorkRepository
  aliases: AliasRepository
  creators: CreatorRepository
  genres: GenreRepository
  tags: TagRepository
  collections: CollectionRepository
  sources: SourceRepository
  history: HistoryRepository
  externalRefs: ExternalRefRepository
}

export class TransferService {
  constructor(
    private readonly db: Database.Database,
    private readonly repositories: TransferRepositories,
    private readonly details: WorkDetailsService,
    private readonly backups: BackupService,
    private readonly logger: Logger,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  exportJson(destination: string): { path: string } {
    const startedAt = Date.now()
    try {
      const payload: AuriLibraryExport = { format: 'auri-library', version: 1, exportedAt: this.now(), works: this.collectWorks() }
      writeFileSync(destination, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      this.logger.info('backup', 'Exportação JSON concluída.', { event: 'export.json_completed', workCount: payload.works.length, size: statSync(destination).size, durationMs: Date.now() - startedAt })
      return { path: destination }
    } catch { throw new DomainError('EXPORT_FAILED', 'Não foi possível exportar a biblioteca em JSON.') }
  }

  exportCsv(destination: string): { path: string } {
    const startedAt = Date.now()
    try {
      const rows = this.collectWorks().map(({ work, creators, genres, tags, collections, sources }) => [
      work.title, work.mediaType, work.userStatus, work.publicationStatus ?? '', work.lastReadChapter?.label ?? '',
      work.lastReadAt ?? '', work.rating ?? '', work.favorite ? 'sim' : 'não', work.notes ?? '',
      sources.find((item) => item.isPreferred)?.seriesUrl ?? sources.find((item) => item.isPreferred)?.domain ?? '', creators.map((item) => item.name).join('; '),
      genres.map((item) => item.name).join('; '), tags.map((item) => item.name).join('; '),
      collections.map((item) => item.name).join('; '), sources.map((item) => item.domain).join('; '), work.deletedAt ?? ''
    ])
      const header = ['Título', 'Tipo', 'Status pessoal', 'Status de publicação', 'Capítulo', 'Última leitura', 'Nota', 'Favorito', 'Notas', 'Fonte preferida', 'Criadores', 'Gêneros', 'Tags', 'Coleções', 'Fontes', 'Na lixeira']
      writeFileSync(destination, `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8')
      this.logger.info('backup', 'Exportação CSV concluída.', { event: 'export.csv_completed', workCount: rows.length, size: statSync(destination).size, durationMs: Date.now() - startedAt })
      return { path: destination }
    } catch { throw new DomainError('EXPORT_FAILED', 'Não foi possível exportar a biblioteca em CSV.') }
  }

  analyzeImport(path: string): ImportPreview {
    const payload = this.readImport(path)
    const candidates = payload.works.map((item, index) => {
      const existing = this.findExisting(item)
      const probable = existing ?? this.findProbable(item)
      const match = existing ? (existing.deletedAt ? 'trash' : 'exact') : probable ? (probable.deletedAt ? 'trash' : 'probable') : 'new'
      return { index, title: item.work.title, match, existingTitle: probable?.title ?? null, hasConflict: !!existing && this.hasPersonalConflict(existing, item.work) } as const
    })
    return {
      path, exportedAt: payload.exportedAt, total: candidates.length,
      newWorks: candidates.filter((item) => item.match === 'new').length,
      exactMatches: candidates.filter((item) => item.match === 'exact').length,
      probableMatches: candidates.filter((item) => item.match === 'probable').length,
      trashMatches: candidates.filter((item) => item.match === 'trash').length,
      conflicts: candidates.filter((item) => item.hasConflict).length,
      candidates
    }
  }

  async applyImport(path: string, strategy?: ImportStrategy, restoreTrash = false): Promise<ImportResult> {
    const startedAt = Date.now()
    this.logger.info('backup', 'Iniciando importação JSON.', { event: 'import.started' })
    const payload = this.readImport(path)
    const preview = this.analyzeImport(path)
    if (preview.conflicts > 0 && !strategy) throw new DomainError('IMPORT_CONFLICT', 'Escolha como resolver os conflitos antes de importar.')
    const result: ImportResult = { created: 0, merged: 0, skipped: 0, restored: 0 }
    const operation = this.db.transaction(() => {
      for (const item of payload.works) {
        const exact = this.findExisting(item)
        const probable = exact ?? this.findProbable(item)
        if (!exact && probable) { result.skipped += 1; continue }
        if (!exact) { this.insertWork(item); result.created += 1; continue }
        if (exact.deletedAt && !restoreTrash) { result.skipped += 1; continue }
        if (exact.deletedAt && restoreTrash) { this.repositories.works.restore(exact.id, this.now()); result.restored += 1 }
        this.mergeWork(exact.id, item, strategy ?? 'keep_current')
        result.merged += 1
      }
    })
    try { const applied = await this.backups.runProtected('before_import', () => { operation.immediate(); return result }); this.logger.info('backup', 'Importação JSON concluída.', { event: 'import.completed', created: applied.created, merged: applied.merged, skipped: applied.skipped, durationMs: Date.now() - startedAt }); return applied } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('IMPORT_FAILED', 'A importação foi cancelada e nenhuma alteração parcial foi mantida.')
    }
  }

  private collectWorks(): AuriExportWork[] {
    const works = [...this.repositories.works.listActive(), ...this.repositories.works.listTrash()]
    return works.map((work) => {
      const details: WorkDetails = this.details.getDetails({ workId: work.id })
      return { work, aliases: details.aliases, creators: details.creators, genres: details.genres, tags: details.tags, collections: details.collections, sources: details.sources, history: this.repositories.history.listByWork(work.id), externalRefs: details.externalRefs }
    })
  }

  private readImport(path: string): AuriLibraryExport {
    try {
      if (statSync(path).size > MAX_IMPORT_BYTES) throw new Error('too large')
      const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
      const header = raw as { format?: unknown; version?: unknown }
      if (header?.format !== 'auri-library') throw new DomainError('IMPORT_INVALID', `Este arquivo não é uma exportação do ${APP_BRAND.name}.`)
      if (header.version !== 1) throw new DomainError('IMPORT_UNSUPPORTED_VERSION', 'Esta versão de exportação ainda não é suportada.')
      return libraryExportSchema.parse(raw) as AuriLibraryExport
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('IMPORT_INVALID', 'O arquivo de importação está corrompido ou incompleto.')
    }
  }

  private findExisting(item: AuriExportWork): Work | null {
    for (const reference of item.externalRefs) {
      const found = this.repositories.externalRefs.findByProviderExternalId(reference.provider, reference.externalId)
      if (found) return this.repositories.works.findById(found.workId)
    }
    return null
  }

  private findProbable(item: AuriExportWork): Work | null {
    for (const title of [item.work.title, ...item.aliases.map((alias) => alias.name)]) {
      const found = this.repositories.works.findByNormalizedTitleOrAlias(normalizeSearchText(title))
      if (found) return found
    }
    return null
  }

  private hasPersonalConflict(current: Work, imported: Work): boolean {
    return current.userStatus !== imported.userStatus || current.rating !== imported.rating || current.favorite !== imported.favorite || current.hiddenFromHome !== imported.hiddenFromHome || current.notes !== imported.notes || current.lastReadChapter?.label !== imported.lastReadChapter?.label
  }

  private insertWork(item: AuriExportWork): string {
    const workId = randomUUID()
    const cover = item.work.cover.type === 'custom' ? { type: 'none' as const, sourceUrl: null, customPath: null, updatedAt: null } : { ...item.work.cover, customPath: null }
    this.repositories.works.create({ ...item.work, id: workId, normalizedTitle: normalizeSearchText(item.work.title), cover })
    this.insertRelated(workId, item, false)
    return workId
  }

  private mergeWork(workId: string, item: AuriExportWork, strategy: ImportStrategy): void {
    const current = this.repositories.works.findById(workId)!
    if (strategy === 'use_imported') {
      const cover = item.work.cover.type === 'custom' ? current.cover : { ...item.work.cover, customPath: null }
      this.repositories.works.update({ ...current, ...item.work, id: workId, normalizedTitle: normalizeSearchText(item.work.title), cover, deletedAt: current.deletedAt, updatedAt: this.now() })
    } else {
      const importedTitle = normalizeSearchText(item.work.title)
      if (importedTitle !== current.normalizedTitle && !this.repositories.aliases.findByWorkAndNormalizedName(workId, importedTitle)) {
        this.repositories.aliases.create({ id: randomUUID(), workId, name: item.work.title, normalizedName: importedTitle, kind: 'imported_title', source: 'import', createdAt: this.now() })
      }
    }
    this.insertRelated(workId, item, true)
  }

  private insertRelated(workId: string, item: AuriExportWork, merging: boolean): void {
    for (const alias of item.aliases) {
      const normalizedName = normalizeSearchText(alias.name)
      if (normalizedName !== this.repositories.works.findById(workId)!.normalizedTitle && !this.repositories.aliases.findByWorkAndNormalizedName(workId, normalizedName)) {
        this.repositories.aliases.create({ ...alias, id: randomUUID(), workId, normalizedName })
      }
    }
    for (const creator of item.creators) {
      const normalizedName = normalizeSearchText(creator.name)
      if (!this.repositories.creators.findDuplicate(workId, normalizedName, creator.role)) this.repositories.creators.create({ ...creator, id: randomUUID(), workId, normalizedName })
    }
    for (const genre of item.genres) {
      const normalizedName = normalizeSearchText(genre.name)
      const local = this.repositories.genres.findByNormalizedName(normalizedName) ?? this.repositories.genres.create({ id: randomUUID(), name: genre.name, normalizedName })
      this.repositories.genres.attachToWork(workId, local.id)
    }
    for (const tag of item.tags) {
      const normalizedName = normalizeSearchText(tag.name)
      const local = this.repositories.tags.findByNormalizedName(normalizedName) ?? this.repositories.tags.create({ id: randomUUID(), name: tag.name, normalizedName, createdAt: tag.createdAt })
      this.repositories.tags.attachToWork(workId, local.id)
    }
    for (const collection of item.collections) {
      const local = this.repositories.collections.listAll().find((candidate) => normalizeSearchText(candidate.name) === normalizeSearchText(collection.name)) ?? this.repositories.collections.create({ ...collection, id: randomUUID() })
      this.repositories.collections.addWork(local.id, workId, this.now())
    }
    const sourceMap = new Map<string, string>()
    for (const source of item.sources) {
      const duplicate = this.repositories.sources.listByWork(workId).find((candidate) => candidate.domain === source.domain && candidate.seriesUrl === source.seriesUrl)
      if (duplicate) { sourceMap.set(source.id, duplicate.id); continue }
      const id = randomUUID()
      const isPreferred = source.status !== 'archived' && source.isPreferred && !this.repositories.sources.listByWork(workId).some((candidate) => candidate.isPreferred)
      this.repositories.sources.create({ ...source, id, workId, isPreferred })
      sourceMap.set(source.id, id)
    }
    for (const reference of item.externalRefs) {
      if (!this.repositories.externalRefs.findByProviderExternalId(reference.provider, reference.externalId)) this.repositories.externalRefs.create({ ...reference, id: randomUUID(), workId })
    }
    const historyIds = new Map<string, string>()
    const signatures = new Set(this.repositories.history.listByWork(workId).map(historySignature))
    for (const history of [...item.history].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const signature = historySignature(history)
      if (signatures.has(signature)) continue
      const id = randomUUID(); historyIds.set(history.id, id); signatures.add(signature)
      this.repositories.history.create({ ...history, id, workId, sourceId: history.sourceId ? sourceMap.get(history.sourceId) ?? null : null, revertsHistoryId: history.revertsHistoryId ? historyIds.get(history.revertsHistoryId) ?? null : null })
    }
    void merging
  }
}

function historySignature(item: ReadingHistory): string { return [item.eventType, item.oldChapter?.label, item.newChapter?.label, item.occurredAt, item.note].join('|') }
function csvCell(value: string | number): string { const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text }
