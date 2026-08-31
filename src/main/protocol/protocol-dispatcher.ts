import {
  PROTOCOL_METHOD, PROTOCOL_METHODS, createErrorResponse, createSuccessResponse, safeParseRequest,
  type KnownCapability, type ProtocolError, type ProtocolMethod, type ProtocolParams, type ProtocolRequest,
  type ProtocolResponse, type ProtocolResult
} from '@auri/protocol'
import { DomainError } from '@shared/errors/domain-error'
import type { Logger } from '../logging/logger'

export type ProtocolHandler<Method extends ProtocolMethod> = (params: ProtocolParams<Method>) => Promise<ProtocolResult<Method>> | ProtocolResult<Method>
export type ProtocolHandlerMap = { [Method in ProtocolMethod]?: ProtocolHandler<Method> }
export type ProtocolFeatureCapability = Exclude<KnownCapability, ProtocolMethod>

export const DESKTOP_PROTOCOL_FEATURES = ['desktop.openAddWork.coverUrl'] as const satisfies readonly ProtocolFeatureCapability[]

const FEATURE_REQUIREMENTS: Record<ProtocolFeatureCapability, ProtocolMethod> = {
  'desktop.openAddWork.coverUrl': PROTOCOL_METHOD.desktopOpenAddWork
}

export class ProtocolHandlerError extends Error {
  constructor(readonly protocolError: ProtocolError) { super(protocolError.message) }
}

export class ProtocolDispatcher {
  readonly capabilities: KnownCapability[]

  constructor(
    private readonly handlers: ProtocolHandlerMap,
    private readonly logger: Logger,
    features: readonly ProtocolFeatureCapability[] = []
  ) {
    const methods = PROTOCOL_METHODS.filter((method): method is Exclude<ProtocolMethod, typeof PROTOCOL_METHOD.systemHello> => (
      method !== PROTOCOL_METHOD.systemHello && Boolean(handlers[method])
    ))
    this.capabilities = [
      ...methods,
      ...features.filter((feature) => Boolean(handlers[FEATURE_REQUIREMENTS[feature]]))
    ]
  }

  async dispatch(input: unknown): Promise<ProtocolResponse> {
    const parsed = safeParseRequest(input)
    if (!parsed.success) return this.invalidRequest(input)
    const request = parsed.data
    const handler = this.handlers[request.method]
    if (!handler) return this.error(request, { code: 'METHOD_NOT_SUPPORTED', message: 'Método não suportado pelo Desktop.' })
    const started = Date.now()
    try {
      const result = await (handler as (params: typeof request.params) => Promise<unknown> | unknown)(request.params)
      this.logger.info('bridge', 'Método do protocolo concluído.', { event: 'bridge.method_completed', method: request.method, durationMs: Date.now() - started })
      return createSuccessResponse(request.id, request.method, result as never) as ProtocolResponse
    } catch (error) {
      const protocolError = mapProtocolError(error)
      this.logger.warn('bridge', 'Método do protocolo recusado.', { event: 'bridge.method_failed', method: request.method, errorCode: protocolError.code, durationMs: Date.now() - started })
      return this.error(request, protocolError)
    }
  }

  private invalidRequest(input: unknown): ProtocolResponse {
    const envelope = input && typeof input === 'object' ? input as Record<string, unknown> : {}
    const id = typeof envelope.id === 'string' && envelope.id.trim() ? envelope.id.slice(0, 128) : 'invalid-request'
    const knownMethod = PROTOCOL_METHODS.includes(envelope.method as ProtocolMethod)
    const method = knownMethod ? envelope.method as ProtocolMethod : PROTOCOL_METHOD.systemHello
    const code = envelope.protocolVersion !== undefined && envelope.protocolVersion !== 1
      ? 'UNSUPPORTED_PROTOCOL_VERSION'
      : typeof envelope.method === 'string' && !knownMethod ? 'METHOD_NOT_SUPPORTED' : 'INVALID_PARAMS'
    return createErrorResponse(id, method, { code, message: code === 'INVALID_PARAMS' ? 'Parâmetros inválidos.' : code === 'METHOD_NOT_SUPPORTED' ? 'Método não suportado.' : 'Versão do protocolo não suportada.' }) as ProtocolResponse
  }

  private error(request: ProtocolRequest, error: ProtocolError): ProtocolResponse {
    return createErrorResponse(request.id, request.method, error) as ProtocolResponse
  }
}

export function mapProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolHandlerError) return error.protocolError
  if (!(error instanceof DomainError)) return { code: 'INTERNAL_ERROR', message: 'O Auri não conseguiu concluir a operação.' }
  if (error.code === 'WORK_NOT_FOUND' || error.code === 'WORK_IN_TRASH') return { code: 'WORK_NOT_FOUND', message: 'Obra não encontrada.' }
  if (error.code === 'SOURCE_NOT_FOUND') return { code: 'SOURCE_NOT_FOUND', message: 'Fonte não encontrada para esta obra.' }
  if (error.code === 'DUPLICATE_SOURCE' || error.code === 'CONFIRMATION_REQUIRED') return { code: 'CONFLICT', message: 'A operação entra em conflito com o estado atual.' }
  if (error.code === 'INVALID_INPUT' || error.code === 'INVALID_CHAPTER' || error.code === 'INVALID_STATUS' || error.code === 'CONSTRAINT_VIOLATION') return { code: 'VALIDATION_ERROR', message: error.message }
  return { code: 'INTERNAL_ERROR', message: 'O Auri não conseguiu concluir a operação.' }
}
