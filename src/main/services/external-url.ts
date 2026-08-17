import { DomainError } from '@shared/errors/domain-error'

export function validateExternalUrl(input: string): URL {
  let url: URL
  try { url = new URL(input) } catch { throw new DomainError('INVALID_INPUT', 'URL inválida.') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new DomainError('INVALID_INPUT', 'Este protocolo não é permitido.')
  return url
}
