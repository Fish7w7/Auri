import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { DomainError } from '@shared/errors/domain-error'
import type { HostResolver } from './types'

const blockedAddresses = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
] as Array<[string, number]>) blockedAddresses.addSubnet(network, prefix, 'ipv4')

for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001:db8::', 32], ['2001:10::', 28], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
] as Array<[string, number]>) blockedAddresses.addSubnet(network, prefix, 'ipv6')

const defaultResolver: HostResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.map((item) => item.address)
}

export function parseAllowedHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new DomainError('URL_INVALID', 'Informe uma URL válida.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new DomainError('URL_PROTOCOL_NOT_ALLOWED', 'Apenas URLs HTTP ou HTTPS são permitidas.')
  }
  if (url.username || url.password) throw new DomainError('URL_INVALID', 'URLs com credenciais não são permitidas.')
  url.hash = ''
  return url
}

export function isBlockedDestination(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLocaleLowerCase('en-US').replace(/\.$/, '')
  if (host.startsWith('::ffff:')) return true
  const family = isIP(host)
  if (family) return blockedAddresses.check(host, family === 4 ? 'ipv4' : 'ipv6')
  if (!host.includes('.')) return true
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host.endsWith('.internal') || host.endsWith('.home.arpa')
}

export async function assertPublicHttpUrl(raw: string, resolver: HostResolver = defaultResolver): Promise<URL> {
  const url = parseAllowedHttpUrl(raw)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (isBlockedDestination(hostname)) {
    throw new DomainError('URL_DESTINATION_BLOCKED', 'Este destino local ou privado não pode ser acessado.')
  }
  if (!isIP(hostname)) {
    let addresses: string[]
    try {
      addresses = await resolver(hostname)
    } catch {
      throw new DomainError('URL_FETCH_FAILED', 'Não foi possível localizar o site informado.')
    }
    if (!addresses.length) throw new DomainError('URL_FETCH_FAILED', 'Não foi possível localizar o site informado.')
    if (addresses.some((address) => isBlockedDestination(address))) {
      throw new DomainError('URL_DESTINATION_BLOCKED', 'Este destino local ou privado não pode ser acessado.')
    }
  }
  return url
}
