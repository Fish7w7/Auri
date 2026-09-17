import { PROTOCOL_VERSION, type KnownCapability, type ProgressUpdateParams, type SourceAddParams, type SourceSummary } from '@auri/protocol'
import type { WorkService } from '../services/work-service'
import type { SourceService } from '../services/source-service'
import type { ProgressService } from '../services/progress-service'
import type { WorkResolutionService } from '../services/work-resolution-service'
import type { WorkContextService } from '../services/work-context-service'
import type { ProtocolHandlerMap } from './protocol-dispatcher'
import { ProtocolHandlerError } from './protocol-dispatcher'
import type { DesktopCommandService } from '../services/desktop-command-service'
import type { Source } from '@shared/types/domain'
import { deriveSeriesUrlFromChapter } from '@shared/utils/source-identity'
import { normalizeSourceUrl } from '@shared/utils/normalize-source-url'
import { normalizeChapter } from '@shared/utils/normalize-chapter'

export interface ProtocolHandlerDependencies {
  appVersion: string
  resolution: WorkResolutionService
  workContext: WorkContextService
  works: WorkService
  sources: SourceService
  progress: ProgressService
  desktop: DesktopCommandService
}

export function createProtocolHandlers(dependencies: ProtocolHandlerDependencies, capabilities: () => KnownCapability[]): ProtocolHandlerMap {
  return {
    'system.hello': (params) => {
      if (!params.supportedProtocolVersions.includes(PROTOCOL_VERSION)) throw new ProtocolHandlerError({ code: 'UNSUPPORTED_PROTOCOL_VERSION', message: 'Não há uma versão de protocolo compatível.' })
      return { protocolVersion: PROTOCOL_VERSION, server: { kind: 'desktop', name: 'auri-desktop', version: dependencies.appVersion }, capabilities: capabilities() }
    },
    'work.resolve': (params) => dependencies.resolution.resolve(params),
    'work.context': (params) => dependencies.workContext.getContext(params),
    'work.open': (params) => { dependencies.works.getWork({ workId: params.workId }); dependencies.desktop.openWork(params.workId); return { opened: true } },
    'desktop.openAddWork': (params) => { dependencies.desktop.openAddWork(params); return { opened: true } },
    'source.add': (params) => {
      const source = addSource(dependencies.sources, params)
      dependencies.desktop.notifyWorkChanged({ workId: params.workId, kind: 'source' })
      return { source: sourceSummary(source) }
    },
    'progress.update': (params) => { updateProgress(dependencies, params); return { updated: true } }
  }
}

function addSource(service: SourceService, params: SourceAddParams): Source {
  return service.createSource({ workId: params.workId, seriesUrl: params.url, name: params.name ?? null, language: params.language ?? null, isPreferred: false })
}

function updateProgress(dependencies: ProtocolHandlerDependencies, params: ProgressUpdateParams): void {
  const sourceId = params.sourceId ?? (params.pageUrl ? dependencies.resolution.inferSource(params.workId, params.pageUrl)?.id : undefined)
  const lastReadUrl = resolveSafeLastReadUrl(dependencies.workContext, params, sourceId)
  const result = dependencies.progress.updateProgressFromLinkedPage(
    { workId: params.workId, chapterLabel: params.chapter.value, sourceId: sourceId ?? null },
    lastReadUrl
  )
  if (!result.applied && result.requiresConfirmation) throw new ProtocolHandlerError({ code: 'CONFLICT', message: result.reason === 'regression' ? 'A atualização reduziria o progresso atual.' : 'A atualização representa um salto grande e precisa de confirmação no Auri.' })
  dependencies.desktop.notifyWorkChanged({ workId: params.workId, kind: 'progress' })
}

function resolveSafeLastReadUrl(
  workContext: WorkContextService,
  params: ProgressUpdateParams,
  sourceId: string | undefined
): string | null {
  if (!params.pageUrl || !sourceId) return null
  const chapter = normalizeChapter(params.chapter.value)
  if (
    chapter.numericValue === null ||
    (params.chapter.numericValue !== undefined && params.chapter.numericValue !== chapter.numericValue)
  ) return null
  const evidence = {
    value: params.chapter.value,
    numericValue: chapter.numericValue,
    confidence: 'high' as const,
    source: 'manual' as const
  }
  const derivedSeriesUrl = deriveSeriesUrlFromChapter(params.pageUrl, evidence)
  const normalizedPageUrl = normalizeSourceUrl(params.pageUrl)
  if (!derivedSeriesUrl || !normalizedPageUrl) return null

  const linkedSource = workContext.findLinkedSource(params.workId, {
    url: normalizedPageUrl,
    detectedChapter: evidence
  })
  return linkedSource?.id === sourceId ? normalizedPageUrl : null
}

function sourceSummary(source: Source): SourceSummary {
  return { id: source.id, ...(source.name ? { name: source.name } : {}), domain: source.domain, status: source.status, isPreferred: source.isPreferred, ...(source.lastReadUrl ? { lastReadUrl: source.lastReadUrl } : {}) }
}
