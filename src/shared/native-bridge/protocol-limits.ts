import { PROTOCOL_LIMITS, PROTOCOL_METHOD } from '@auri/protocol'

export function exceedsHelloVersionLimit(input: unknown): boolean {
  if (typeof input !== 'object' || input === null || !('method' in input) ||
      input.method !== PROTOCOL_METHOD.systemHello || !('params' in input)) return false

  const params = input.params
  if (typeof params !== 'object' || params === null || !('supportedProtocolVersions' in params)) return false

  // Zod 3 still validates each element after finding an oversized array.
  const versions = params.supportedProtocolVersions
  return Array.isArray(versions) && versions.length > PROTOCOL_LIMITS.supportedProtocolVersions
}
