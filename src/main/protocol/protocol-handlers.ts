import { PROTOCOL_VERSION, type Capability, type ProgressUpdateParams, type SourceAddParams, type SourceSummary } from '@auri/protocol'
import type { WorkService } from '../services/work-service'
import type { SourceService } from '../services/source-service'
import type { ProgressService } from '../services/progress-service'
import type { WorkResolutionService } from '../services/work-resolution-service'
import type { ProtocolHandlerMap } from './protocol-dispatcher'
import { ProtocolHandlerError } from './protocol-dispatcher'
import type { DesktopCommandService } from '../services/desktop-command-service'
import type { Source } from '@shared/types/domain'

export interface ProtocolHandlerDependencies {
  appVersion: string
  resolution: WorkResolutionService
  works: WorkService
  sources: SourceService
  progress: ProgressService
  desktop: DesktopCommandService
}

export function createProtocolHandlers(dependencies: ProtocolHandlerDependencies, capabilities: () => Capability[]): ProtocolHandlerMap {
  return {
    'system.hello': (params) => {
      if (!params.supportedProtocolVersions.includes(PROTOCOL_VERSION)) throw new ProtocolHandlerError({ code: 'UNSUPPORTED_PROTOCOL_VERSION', message: 'Não há uma versão de protocolo compatível.' })
      return { protocolVersion: PROTOCOL_VERSION, server: { kind: 'desktop', name: 'auri-desktop', version: dependencies.appVersion }, capabilities: capabilities() }
    },
    'work.resolve': (params) => dependencies.resolution.resolve(params),
    'work.open': (params) => { dependencies.works.getWork({ workId: params.workId }); dependencies.desktop.openWork(params.workId); return { opened: true } },
    'desktop.openAddWork': (params) => { dependencies.desktop.openAddWork(params); return { opened: true } },
    'source.add': (params) => ({ source: sourceSummary(addSource(dependencies.sources, params)) }),
    'progress.update': (params) => { updateProgress(dependencies, params); return { updated: true } }
  }
}

function addSource(service: SourceService, params: SourceAddParams): Source {
  return service.createSource({ workId: params.workId, seriesUrl: params.url, name: params.name ?? null, language: params.language ?? null, isPreferred: false })
}

function updateProgress(dependencies: ProtocolHandlerDependencies, params: ProgressUpdateParams): void {
  const sourceId = params.sourceId ?? (params.pageUrl ? dependencies.resolution.inferSource(params.workId, params.pageUrl)?.id : undefined)
  const result = dependencies.progress.updateProgress({ workId: params.workId, chapterLabel: params.chapter.value, sourceId: sourceId ?? null })
  if (!result.applied && result.requiresConfirmation) throw new ProtocolHandlerError({ code: 'CONFLICT', message: result.reason === 'regression' ? 'A atualização reduziria o progresso atual.' : 'A atualização representa um salto grande e precisa de confirmação no Auri.' })
}

function sourceSummary(source: Source): SourceSummary {
  return { id: source.id, ...(source.name ? { name: source.name } : {}), domain: source.domain, status: source.status, isPreferred: source.isPreferred, ...(source.lastReadUrl ? { lastReadUrl: source.lastReadUrl } : {}) }
}
