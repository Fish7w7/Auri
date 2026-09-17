import type Database from 'better-sqlite3'
import type {
  AppSettings, WorkMergeConflict, WorkMergeConflictField, WorkMergeExecuteRequest,
  WorkMergePreview, WorkMergePreviewRequest, WorkMergeResult
} from '@shared/contracts'
import type { ExternalRef, MetadataOverride, Source, Work } from '@shared/types/domain'
import { DomainError } from '@shared/errors/domain-error'
import { workMergeExecuteSchema, workMergePreviewSchema } from '@shared/schemas/domain'
import { normalizeSearchText } from '@shared/utils/normalize-search-text'
import { preferredHumanPageTitle } from '@shared/utils/normalize-work-title'
import type { WorkRepository } from '../database/repositories/work-repository'
import type { SourceRepository } from '../database/repositories/source-repository'
import type { MetadataOverrideRepository } from '../database/repositories/metadata-override-repository'
import type { SourceIdentityService } from './source-identity-service'
import type { BackupService } from './backup/backup-service'
import { generateId, parseDomainInput, utcNow, type Clock, type IdGenerator } from './service-utils'

interface MergeRepositories {
  works: WorkRepository
  sources: SourceRepository
  overrides: MetadataOverrideRepository
}

interface MergeSettings {
  getSettings(): AppSettings
  updateSettings(input: { recentWorkIds: string[] }): AppSettings
}

interface MergePlan {
  preview: WorkMergePreview
  primary: Work
  secondary: Work
  primarySources: Source[]
  secondarySources: Source[]
  sourceTargets: Map<string, string>
  externalRefs: ExternalRef[]
  overrides: MetadataOverride[]
  automaticWinners: Partial<Record<WorkMergeConflictField, string>>
  secondaryTitleAlias: { name: string; normalizedName: string } | null
}

const LABELS: Record<WorkMergeConflictField, string> = {
  progress: 'Progresso', userStatus: 'Status pessoal', notes: 'Notas', lastReadNote: 'Nota da última leitura',
  cover: 'Capa', mediaType: 'Tipo de mídia', publicationStatus: 'Status de publicação',
  description: 'Descrição', countryCode: 'País', startDate: 'Data de início', endDate: 'Data de término', rating: 'Avaliação'
}

const OVERRIDE_KEYS: Partial<Record<WorkMergeConflictField, string>> = {
  cover: 'cover', mediaType: 'media_type', publicationStatus: 'publication_status', description: 'description',
  countryCode: 'country_code', startDate: 'start_date', endDate: 'end_date'
}

export class WorkMergeService {
  constructor(
    private readonly db: Database.Database,
    private readonly repositories: MergeRepositories,
    private readonly sourceIdentity: SourceIdentityService,
    private readonly settings: MergeSettings,
    private readonly backups?: Pick<BackupService, 'runProtected'>,
    private readonly clock: Clock = utcNow,
    private readonly idGenerator: IdGenerator = generateId
  ) {}

  previewMerge(input: unknown): WorkMergePreview {
    const request = parseDomainInput(workMergePreviewSchema, input) as WorkMergePreviewRequest
    return this.buildPlan(request.primaryWorkId, request.secondaryWorkId).preview
  }

  async merge(input: unknown): Promise<WorkMergeResult> {
    const request = parseDomainInput(workMergeExecuteSchema, input) as WorkMergeExecuteRequest
    const before = this.settings.getSettings()
    let settingsWritten = false
    const execute = (): WorkMergeResult => {
      try {
        return this.db.transaction(() => {
          const plan = this.buildPlan(request.primaryWorkId, request.secondaryWorkId)
          if (plan.preview.blockers.length) {
            throw new DomainError('WORK_MERGE_CONFLICT', 'A mesclagem possui um conflito bloqueante.', { blocker: plan.preview.blockers[0].code })
          }
          this.validateChoices(plan, request)
          const now = this.clock()
          const merged = this.mergeWork(plan, request, now)

          this.transferAliases(plan, now)
          const preferredSourceId = this.transferSources(plan, request, now)
          this.transferExternalRefs(plan)
          this.transferCreators(plan)
          this.transferManyToMany(plan)
          this.db.prepare('UPDATE reading_history SET work_id = ? WHERE work_id = ?').run(plan.primary.id, plan.secondary.id)
          this.transferOverrides(plan)
          this.repositories.works.update(merged)

          const recentWorkIds = replaceRecentWorkId(this.settings.getSettings().recentWorkIds, plan.primary.id, plan.secondary.id)
          this.settings.updateSettings({ recentWorkIds })
          settingsWritten = true

          if (!this.repositories.works.deletePermanently(plan.secondary.id)) {
            throw new DomainError('INVALID_WORK_MERGE', 'A obra incorporada não pôde ser removida.')
          }
          if (preferredSourceId) {
            this.repositories.sources.clearPreferred(plan.primary.id, now)
            if (!this.repositories.sources.setPreferred(preferredSourceId, now)) {
              throw new DomainError('INVALID_WORK_MERGE', 'A fonte preferida escolhida não está disponível.')
            }
          }
          const foreignKeyErrors = this.db.pragma('foreign_key_check') as unknown[]
          if (foreignKeyErrors.length) throw new DomainError('CONSTRAINT_VIOLATION', 'A integridade das relações não pôde ser confirmada.')
          return { work: merged, removedWorkId: plan.secondary.id }
        }).immediate()
      } catch (error) {
        if (settingsWritten) this.settings.updateSettings({ recentWorkIds: before.recentWorkIds })
        throw error
      }
    }
    return this.backups
      ? this.backups.runProtected('before_merge', execute, 'maintenance')
      : execute()
  }

  private buildPlan(primaryId: string, secondaryId: string): MergePlan {
    if (primaryId === secondaryId) throw new DomainError('INVALID_WORK_MERGE', 'Escolha duas obras diferentes.')
    const primary = this.repositories.works.findActiveById(primaryId)
    const secondary = this.repositories.works.findActiveById(secondaryId)
    if (!primary || !secondary) throw new DomainError('WORK_NOT_FOUND', 'Uma das obras não existe ou está na Lixeira.')

    const primarySources = this.repositories.sources.listByWork(primary.id)
    const secondarySources = this.repositories.sources.listByWork(secondary.id)
    const sourceTargets = new Map<string, string>()
    const blockers: WorkMergePreview['blockers'] = []
    for (const source of secondarySources) {
      const pageUrl = source.seriesUrl ?? source.lastReadUrl
      if (!pageUrl) continue
      const matches = this.sourceIdentity.findMatches({ pageUrl })
        .filter((match) => match.work.id === primary.id)
      const targets = [...new Set(matches.map((match) => match.source.id))]
      if (targets.length > 1) blockers.push({
        code: 'SOURCE_IDENTITY_AMBIGUOUS',
        message: `A fonte ${source.name ?? source.domain} corresponde a mais de uma fonte da obra mantida.`
      })
      else if (targets[0]) sourceTargets.set(source.id, targets[0])
    }

    const externalRefs = this.rows<ExternalRefRow>('SELECT * FROM external_refs WHERE work_id IN (?, ?)', primary.id, secondary.id)
      .map(mapExternalRef)
    const byProvider = new Map<string, ExternalRef[]>()
    for (const reference of externalRefs) {
      const key = normalizeSearchText(reference.provider)
      byProvider.set(key, [...(byProvider.get(key) ?? []), reference])
    }
    for (const references of byProvider.values()) {
      const ids = new Set(references.map((reference) => reference.externalId))
      const works = new Set(references.map((reference) => reference.workId))
      if (ids.size > 1 && works.size > 1) blockers.push({
        code: 'EXTERNAL_ID_CONFLICT',
        message: `Essas obras possuem identificadores externos diferentes no ${references[0].provider}.`
      })
    }

    const overrides = [
      ...this.repositories.overrides.listByWork(primary.id),
      ...this.repositories.overrides.listByWork(secondary.id)
    ]
    const conflicts: WorkMergeConflict[] = []
    const automaticWinners: Partial<Record<WorkMergeConflictField, string>> = {}
    this.addConflict(conflicts, automaticWinners, 'progress', primary.lastReadChapter, secondary.lastReadChapter, primary, secondary, overrides)
    this.addConflict(conflicts, automaticWinners, 'userStatus', primary.userStatus, secondary.userStatus, primary, secondary, overrides, true)
    this.addConflict(conflicts, automaticWinners, 'notes', primary.notes, secondary.notes, primary, secondary, overrides)
    this.addConflict(conflicts, automaticWinners, 'lastReadNote', primary.lastReadNote, secondary.lastReadNote, primary, secondary, overrides)
    this.addConflict(conflicts, automaticWinners, 'cover', primary.cover.type === 'none' ? null : primary.cover, secondary.cover.type === 'none' ? null : secondary.cover, primary, secondary, overrides)
    for (const field of ['mediaType', 'publicationStatus', 'description', 'countryCode', 'startDate', 'endDate', 'rating'] as const) {
      this.addConflict(conflicts, automaticWinners, field, primary[field], secondary[field], primary, secondary, overrides)
    }

    const aliases = this.rows<{ name: string; normalized_name: string; work_id: string }>(
      'SELECT name, normalized_name, work_id FROM aliases WHERE work_id IN (?, ?)', primary.id, secondary.id
    )
    const aliasNames = new Map<string, string>()
    for (const alias of aliases) if (alias.normalized_name !== primary.normalizedTitle) aliasNames.set(alias.normalized_name, alias.name)
    const humanSecondaryTitle = preferredHumanPageTitle({
      title: secondary.title,
      siteNames: secondarySources.flatMap((source) => [source.name, source.domain]),
      domain: secondarySources[0]?.domain
    })
    const humanSecondaryNormalized = humanSecondaryTitle ? normalizeSearchText(humanSecondaryTitle) : ''
    const secondaryTitleAlias = humanSecondaryTitle && humanSecondaryNormalized !== primary.normalizedTitle && !aliases.some((alias) => alias.normalized_name === humanSecondaryNormalized)
      ? { name: humanSecondaryTitle, normalizedName: humanSecondaryNormalized }
      : null
    if (secondaryTitleAlias) aliasNames.set(secondaryTitleAlias.normalizedName, secondaryTitleAlias.name)

    const mappedPreferred = (source: Source | undefined) => source ? sourceTargets.get(source.id) ?? source.id : null
    const primaryPreferred = mappedPreferred(primarySources.find((source) => source.isPreferred))
    const secondaryPreferred = mappedPreferred(secondarySources.find((source) => source.isPreferred))
    const preferredIds = [...new Set([primaryPreferred, secondaryPreferred].filter((id): id is string => Boolean(id)))]
    const allSources = [...primarySources, ...secondarySources]
    const preferredSourceOptions = preferredIds.map((id) => {
      const source = allSources.find((candidate) => candidate.id === id) ?? primarySources.find((candidate) => candidate.id === id)!
      return { id, name: source.name ?? source.domain, workId: source.workId }
    })

    const totals = {
      sources: primarySources.length + secondarySources.length - sourceTargets.size,
      aliases: aliasNames.size,
      externalRefs: [...byProvider.values()].reduce((sum, refs) => sum + new Set(refs.map((ref) => ref.externalId)).size, 0),
      creators: this.countDistinct('work_creators', "normalized_name || ':' || role", primary.id, secondary.id),
      genres: this.countDistinct('work_genres', 'genre_id', primary.id, secondary.id),
      tags: this.countDistinct('work_tags', 'tag_id', primary.id, secondary.id),
      collections: this.countDistinct('collection_items', 'collection_id', primary.id, secondary.id),
      history: this.countRows('reading_history', primary.id, secondary.id)
    }
    const automaticActions = [
      'O título e o ID da obra mantida serão preservados.',
      'Aliases, fontes, criadores, gêneros, tags, coleções e histórico serão unidos.',
      'Favorito será preservado se estiver ativo em qualquer uma das obras.',
      'A visibilidade na Home seguirá a obra mantida.'
    ]
    return {
      primary, secondary, primarySources, secondarySources, sourceTargets, externalRefs, overrides, automaticWinners, secondaryTitleAlias,
      preview: {
        primary, secondary, totals, aliasesToAdd: [...aliasNames.values()], automaticActions, conflicts, blockers,
        preferredSourceOptions: preferredIds.length > 1 ? preferredSourceOptions : [],
        defaultPreferredSourceId: primaryPreferred ?? secondaryPreferred
      }
    }
  }

  private addConflict(
    conflicts: WorkMergeConflict[], automaticWinners: Partial<Record<WorkMergeConflictField, string>>,
    field: WorkMergeConflictField, primaryValue: unknown, secondaryValue: unknown,
    primary: Work, secondary: Work, overrides: MetadataOverride[], always = false
  ): void {
    if (equalValue(primaryValue, secondaryValue)) return
    if (!hasValue(primaryValue)) { automaticWinners[field] = secondary.id; return }
    if (!hasValue(secondaryValue)) { automaticWinners[field] = primary.id; return }
    const overrideKey = OVERRIDE_KEYS[field]
    if (overrideKey) {
      const primaryManual = overrides.some((item) => item.workId === primary.id && item.fieldKey === overrideKey)
      const secondaryManual = overrides.some((item) => item.workId === secondary.id && item.fieldKey === overrideKey)
      if (primaryManual !== secondaryManual) {
        automaticWinners[field] = primaryManual ? primary.id : secondary.id
        return
      }
    }
    if (always || !equalValue(primaryValue, secondaryValue)) conflicts.push({
      field, label: LABELS[field], primaryValue: displayValue(field, primaryValue),
      secondaryValue: displayValue(field, secondaryValue), defaultWorkId: primary.id
    })
  }

  private validateChoices(plan: MergePlan, request: WorkMergeExecuteRequest): void {
    for (const conflict of plan.preview.conflicts) {
      const choice = request.fieldChoices[conflict.field]
      if (choice !== plan.primary.id && choice !== plan.secondary.id) {
        throw new DomainError('WORK_MERGE_CONFLICT', `Escolha um valor para ${conflict.label}.`, { field: conflict.field })
      }
    }
    if (plan.preview.preferredSourceOptions.length > 1 && !plan.preview.preferredSourceOptions.some((item) => item.id === request.preferredSourceId)) {
      throw new DomainError('WORK_MERGE_CONFLICT', 'Escolha qual fonte deve permanecer preferida.', { field: 'preferredSource' })
    }
  }

  private mergeWork(plan: MergePlan, request: WorkMergeExecuteRequest, now: string): Work {
    const pick = <K extends keyof Work>(field: WorkMergeConflictField, key: K): Work[K] => {
      const winner = request.fieldChoices[field] ?? plan.automaticWinners[field]
      if (winner === plan.secondary.id) return plan.secondary[key]
      return plan.primary[key]
    }
    const progressWinner = request.fieldChoices.progress ?? plan.automaticWinners.progress
    const lastReadChapter = pick('progress', 'lastReadChapter')
    const lastReadAt = progressWinner === plan.secondary.id ? plan.secondary.lastReadAt
      : equalValue(plan.primary.lastReadChapter, plan.secondary.lastReadChapter)
        ? maxTimestamp(plan.primary.lastReadAt, plan.secondary.lastReadAt)
        : plan.primary.lastReadAt
    return {
      ...plan.primary,
      mediaType: pick('mediaType', 'mediaType'), userStatus: pick('userStatus', 'userStatus'),
      publicationStatus: pick('publicationStatus', 'publicationStatus'), description: pick('description', 'description'),
      countryCode: pick('countryCode', 'countryCode'), startDate: pick('startDate', 'startDate'), endDate: pick('endDate', 'endDate'),
      lastReadChapter, lastReadAt, rating: pick('rating', 'rating'), favorite: plan.primary.favorite || plan.secondary.favorite,
      notes: pick('notes', 'notes'), lastReadNote: pick('lastReadNote', 'lastReadNote'), cover: pick('cover', 'cover'),
      metadataUpdatedAt: maxTimestamp(plan.primary.metadataUpdatedAt, plan.secondary.metadataUpdatedAt), updatedAt: now
    }
  }

  private transferAliases(plan: MergePlan, now: string): void {
    const existing = new Set(this.rows<{ normalized_name: string }>('SELECT normalized_name FROM aliases WHERE work_id = ?', plan.primary.id).map((row) => row.normalized_name))
    const secondaryAliases = this.rows<{ id: string; name: string; normalized_name: string }>('SELECT id, name, normalized_name FROM aliases WHERE work_id = ?', plan.secondary.id)
    for (const alias of secondaryAliases) {
      if (alias.normalized_name === plan.primary.normalizedTitle || existing.has(alias.normalized_name)) continue
      this.db.prepare('UPDATE aliases SET work_id = ? WHERE id = ?').run(plan.primary.id, alias.id)
      existing.add(alias.normalized_name)
    }
    if (plan.secondaryTitleAlias && !existing.has(plan.secondaryTitleAlias.normalizedName)) {
      this.db.prepare(`INSERT INTO aliases (id, work_id, name, normalized_name, kind, source, created_at) VALUES (?, ?, ?, ?, 'merged_title', 'merge', ?)`)
        .run(this.idGenerator(), plan.primary.id, plan.secondaryTitleAlias.name, plan.secondaryTitleAlias.normalizedName, now)
    }
  }

  private transferSources(plan: MergePlan, request: WorkMergeExecuteRequest, now: string): string | null {
    this.repositories.sources.clearPreferred(plan.primary.id, now)
    this.repositories.sources.clearPreferred(plan.secondary.id, now)
    for (const source of plan.secondarySources) {
      const targetId = plan.sourceTargets.get(source.id)
      if (!targetId) {
        this.db.prepare('UPDATE sources SET work_id = ?, is_preferred = 0, updated_at = ? WHERE id = ?').run(plan.primary.id, now, source.id)
        continue
      }
      const target = this.repositories.sources.findById(targetId)
      if (!target) throw new DomainError('INVALID_WORK_MERGE', 'Uma fonte equivalente deixou de existir.')
      const useSecondaryReadUrl = Boolean(source.lastReadUrl) && (!target.lastReadUrl || newer(source.lastUsedAt, target.lastUsedAt))
      this.repositories.sources.update({
        ...target,
        name: target.name ?? source.name,
        language: target.language ?? source.language,
        seriesUrl: target.seriesUrl ?? source.seriesUrl,
        lastReadUrl: useSecondaryReadUrl ? source.lastReadUrl : target.lastReadUrl,
        translatorGroup: target.translatorGroup ?? source.translatorGroup,
        status: preferredStatus(target.status, source.status),
        isPreferred: false,
        lastUsedAt: maxTimestamp(target.lastUsedAt, source.lastUsedAt),
        updatedAt: now
      })
      this.db.prepare('UPDATE reading_history SET source_id = ? WHERE source_id = ?').run(target.id, source.id)
      this.repositories.sources.deletePermanently(source.id)
    }
    const mapped = (id: string | null | undefined) => id ? plan.sourceTargets.get(id) ?? id : null
    return mapped(request.preferredSourceId ?? plan.preview.defaultPreferredSourceId)
  }

  private transferExternalRefs(plan: MergePlan): void {
    const primaryRefs = plan.externalRefs.filter((ref) => ref.workId === plan.primary.id)
    for (const reference of plan.externalRefs.filter((ref) => ref.workId === plan.secondary.id)) {
      const duplicate = primaryRefs.find((candidate) => normalizeSearchText(candidate.provider) === normalizeSearchText(reference.provider) && candidate.externalId === reference.externalId)
      if (duplicate) {
        this.db.prepare('UPDATE external_refs SET canonical_url = ?, last_synced_at = ? WHERE id = ?')
          .run(duplicate.canonicalUrl ?? reference.canonicalUrl, maxTimestamp(duplicate.lastSyncedAt, reference.lastSyncedAt), duplicate.id)
        this.db.prepare('DELETE FROM external_refs WHERE id = ?').run(reference.id)
      } else this.db.prepare('UPDATE external_refs SET work_id = ? WHERE id = ?').run(plan.primary.id, reference.id)
    }
  }

  private transferCreators(plan: MergePlan): void {
    const creators = this.rows<{ id: string; normalized_name: string; role: string }>('SELECT id, normalized_name, role FROM work_creators WHERE work_id = ?', plan.secondary.id)
    for (const creator of creators) {
      const duplicate = this.db.prepare('SELECT 1 FROM work_creators WHERE work_id = ? AND normalized_name = ? AND role = ?').get(plan.primary.id, creator.normalized_name, creator.role)
      if (!duplicate) this.db.prepare('UPDATE work_creators SET work_id = ? WHERE id = ?').run(plan.primary.id, creator.id)
    }
  }

  private transferManyToMany(plan: MergePlan): void {
    this.db.prepare('INSERT OR IGNORE INTO work_genres (work_id, genre_id) SELECT ?, genre_id FROM work_genres WHERE work_id = ?').run(plan.primary.id, plan.secondary.id)
    this.db.prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id) SELECT ?, tag_id FROM work_tags WHERE work_id = ?').run(plan.primary.id, plan.secondary.id)
    this.db.prepare('INSERT OR IGNORE INTO collection_items (collection_id, work_id, added_at) SELECT collection_id, ?, added_at FROM collection_items WHERE work_id = ?').run(plan.primary.id, plan.secondary.id)
  }

  private transferOverrides(plan: MergePlan): void {
    for (const override of plan.overrides.filter((item) => item.workId === plan.secondary.id)) {
      const current = plan.overrides.find((item) => item.workId === plan.primary.id && item.fieldKey === override.fieldKey)
      if (!current || override.lockedAt > current.lockedAt) this.repositories.overrides.set({ ...override, workId: plan.primary.id })
    }
  }

  private rows<T>(sql: string, ...params: unknown[]): T[] { return this.db.prepare(sql).all(...params) as T[] }
  private countDistinct(table: string, expression: string, first: string, second: string): number {
    return (this.db.prepare(`SELECT COUNT(DISTINCT ${expression}) AS count FROM ${table} WHERE work_id IN (?, ?)`).get(first, second) as { count: number }).count
  }
  private countRows(table: string, first: string, second: string): number {
    return (this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE work_id IN (?, ?)`).get(first, second) as { count: number }).count
  }
}

interface ExternalRefRow { id: string; work_id: string; provider: string; external_id: string; canonical_url: string | null; last_synced_at: string | null; created_at: string }
function mapExternalRef(row: ExternalRefRow): ExternalRef { return { id: row.id, workId: row.work_id, provider: row.provider, externalId: row.external_id, canonicalUrl: row.canonical_url, lastSyncedAt: row.last_synced_at, createdAt: row.created_at } }
function equalValue(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }
function hasValue(value: unknown): boolean { return value !== null && value !== undefined && value !== '' }
function displayValue(field: WorkMergeConflictField, value: unknown): string {
  if (field === 'progress' && value && typeof value === 'object' && 'label' in value) return `Capítulo ${String((value as { label: unknown }).label)}`
  if (field === 'cover' && value && typeof value === 'object' && 'type' in value) return (value as { type: string }).type === 'custom' ? 'Capa personalizada' : 'Capa remota'
  return value === null || value === undefined || value === '' ? 'Não informado' : String(value)
}
function maxTimestamp(left: string | null, right: string | null): string | null { return !left ? right : !right ? left : left >= right ? left : right }
function newer(left: string | null, right: string | null): boolean { return Boolean(left && (!right || left > right)) }
function preferredStatus(left: Source['status'], right: Source['status']): Source['status'] {
  const rank: Record<Source['status'], number> = { active: 3, unavailable: 2, archived: 1 }
  return rank[left] >= rank[right] ? left : right
}
export function replaceRecentWorkId(ids: readonly string[], primaryId: string, secondaryId: string): string[] {
  const position = ids.findIndex((id) => id === primaryId || id === secondaryId)
  if (position < 0) return [...ids]
  const filtered = ids.filter((id) => id !== primaryId && id !== secondaryId)
  filtered.splice(position, 0, primaryId)
  return filtered.slice(0, 20)
}
