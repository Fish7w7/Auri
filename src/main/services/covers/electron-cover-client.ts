import { net } from 'electron'
import { DomainError } from '@shared/errors/domain-error'
import type { CoverDownloadClient } from './types'

export class ElectronCoverClient implements CoverDownloadClient {
  isOnline(): boolean { return net.isOnline() }
  async download(url: string, { maxBytes, timeoutMs }: { maxBytes: number; timeoutMs: number }): Promise<Buffer> {
    if (!this.isOnline()) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A capa não está disponível offline.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await net.fetch(url, { signal: controller.signal })
      if (!response.ok) throw new DomainError('COVER_DOWNLOAD_FAILED', 'Não foi possível baixar a capa.')
      const declared = Number(response.headers.get('content-length') ?? '0')
      if (declared > maxBytes) throw new DomainError('COVER_TOO_LARGE', 'A capa remota excede o limite permitido.')
      if (!response.body) throw new DomainError('COVER_DOWNLOAD_FAILED', 'A resposta da capa está vazia.')
      const chunks: Uint8Array[] = []
      let size = 0
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBytes) { controller.abort(); throw new DomainError('COVER_TOO_LARGE', 'A capa remota excede o limite permitido.') }
        chunks.push(value)
      }
      return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size)
    } catch (error) {
      if (error instanceof DomainError) throw error
      if (controller.signal.aborted) throw new DomainError('COVER_TIMEOUT', 'O download da capa excedeu o tempo limite.')
      throw new DomainError('COVER_DOWNLOAD_FAILED', 'Não foi possível baixar a capa.')
    } finally { clearTimeout(timeout) }
  }
}
