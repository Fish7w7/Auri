import { net } from 'electron'
import type { GraphqlHttpResponse, GraphqlTransport } from './types'

export class ElectronGraphqlTransport implements GraphqlTransport {
  isOnline(): boolean { return net.isOnline() }
  async post(url: string, body: unknown, signal?: AbortSignal): Promise<GraphqlHttpResponse> {
    const response = await net.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal })
    return { status: response.status, headers: { 'retry-after': response.headers.get('retry-after'), 'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining') }, json: () => response.json() }
  }
}
