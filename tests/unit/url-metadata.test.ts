import { describe, expect, it } from 'vitest'
import { extractPageMetadata } from '@main/services/url-metadata/page-metadata-extractor'
import { SafePageFetcher } from '@main/services/url-metadata/safe-page-fetcher'
import type { PageTransport, PageTransportResponse } from '@main/services/url-metadata/types'

const publicResolver = async () => ['93.184.216.34']

class FakeTransport implements PageTransport {
  readonly calls: string[] = []
  constructor(private readonly responses: PageTransportResponse[]) {}
  async request(url: string): Promise<PageTransportResponse> {
    this.calls.push(url)
    const response = this.responses.shift()
    if (!response) throw new Error('Resposta fake ausente.')
    return response
  }
}

function htmlResponse(html: string): PageTransportResponse {
  return { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(html) }
}

describe('análise segura de páginas por URL', () => {
  it('rejeita protocolos não permitidos antes de acessar a rede', async () => {
    const transport = new FakeTransport([])
    await expect(new SafePageFetcher(transport, publicResolver).fetch('file:///etc/passwd'))
      .rejects.toMatchObject({ code: 'URL_PROTOCOL_NOT_ALLOWED' })
    expect(transport.calls).toHaveLength(0)
  })

  it.each(['http://localhost/obra', 'http://127.0.0.1/obra', 'http://192.168.1.20/obra', 'http://[::1]/obra'])(
    'bloqueia destino local ou privado: %s',
    async (url) => {
      const transport = new FakeTransport([])
      await expect(new SafePageFetcher(transport, publicResolver).fetch(url))
        .rejects.toMatchObject({ code: 'URL_DESTINATION_BLOCKED' })
      expect(transport.calls).toHaveLength(0)
    }
  )

  it('bloqueia hostname público que resolve para IP privado', async () => {
    const transport = new FakeTransport([])
    await expect(new SafePageFetcher(transport, async () => ['10.0.0.8']).fetch('https://private.example/obra'))
      .rejects.toMatchObject({ code: 'URL_DESTINATION_BLOCKED' })
    expect(transport.calls).toHaveLength(0)
  })

  it('revalida e bloqueia o destino de cada redirect', async () => {
    const transport = new FakeTransport([
      { statusCode: 302, headers: { location: 'http://127.0.0.1/admin' }, body: Buffer.alloc(0) }
    ])
    let failure: unknown
    try { await new SafePageFetcher(transport, publicResolver).fetch('https://safe.example/obra') } catch (error) { failure = error }
    expect(transport.calls).toEqual(['https://safe.example/obra'])
    expect(failure).toMatchObject({ code: 'URL_REDIRECT_BLOCKED' })
  })
})

describe('extração genérica de metadata HTML', () => {
  it('extrai Open Graph, canonical e fallbacks HTML básicos', () => {
    const result = extractPageMetadata(`
      <html><head>
        <title>Título de fallback</title>
        <meta property="og:title" content="Nano &amp; Machine">
        <meta property="og:description" content="Descrição principal">
        <meta property="og:site_name" content="Exemplo Scan">
        <meta property="og:image" content="/covers/nano.jpg">
        <link rel="alternate canonical" href="/obra/nano-machine">
      </head></html>
    `, 'https://scan.example/link', 'https://scan.example/redirected')

    expect(result).toMatchObject({
      title: 'Nano & Machine', description: 'Descrição principal', siteName: 'Exemplo Scan',
      canonicalUrl: 'https://scan.example/obra/nano-machine', coverUrl: 'https://scan.example/covers/nano.jpg'
    })
  })

  it('usa JSON-LD útil e ignora JSON-LD inválido sem perder outros fallbacks', () => {
    const result = extractPageMetadata(`
      <html><head>
        <title>Título HTML</title>
        <meta name="description" content="Descrição HTML">
        <script type="application/ld+json">{ inválido }</script>
        <script type="application/ld+json">{
          "@type": "Book", "name": "The Shepherd Wizard",
          "image": { "url": "/cover.webp" }, "publisher": { "name": "Leitura Exemplo" }
        }</script>
      </head></html>
    `, 'https://reader.example/work', 'https://reader.example/work')

    expect(result).toMatchObject({
      title: 'The Shepherd Wizard', description: 'Descrição HTML', siteName: 'Leitura Exemplo',
      coverUrl: 'https://reader.example/cover.webp'
    })
  })

  it('retorna resultado parcial quando a página não possui metadata útil', () => {
    const result = extractPageMetadata('<html><body>Conteúdo sem head.</body></html>', 'https://reader.example/x', 'https://reader.example/x')
    expect(result).toMatchObject({
      finalUrl: 'https://reader.example/x', domain: 'reader.example', title: null,
      canonicalUrl: null, description: null, coverUrl: null
    })
  })
})
