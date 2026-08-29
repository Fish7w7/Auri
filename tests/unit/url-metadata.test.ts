import { describe, expect, it, vi } from 'vitest'
import { extractPageMetadata } from '@main/services/url-metadata/page-metadata-extractor'
import { SafePageFetcher } from '@main/services/url-metadata/safe-page-fetcher'
import type { PageTransport, PageTransportResponse } from '@main/services/url-metadata/types'

const publicResolver = async () => ['93.184.216.34']

class FakeTransport implements PageTransport {
  readonly calls: string[] = []
  constructor(private readonly responses: PageTransportResponse[], public online = true) {}
  isOnline(): boolean { return this.online }
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
  it('falha antes de DNS/fetch quando offline e tenta normalmente depois', async () => {
    let resolutions = 0
    const resolver = async () => { resolutions += 1; return ['93.184.216.34'] }
    const transport = new FakeTransport([htmlResponse('<html><title>Online novamente</title></html>')], false)
    const fetcher = new SafePageFetcher(transport, resolver)

    await expect(fetcher.fetch('https://offline.example/obra')).rejects.toMatchObject({ code: 'URL_FETCH_FAILED', details: { offline: true } })
    expect(resolutions).toBe(0)
    expect(transport.calls).toHaveLength(0)

    transport.online = true
    await expect(fetcher.fetch('https://offline.example/obra')).resolves.toMatchObject({ finalUrl: 'https://offline.example/obra' })
    expect(resolutions).toBe(1)
    expect(transport.calls).toHaveLength(1)
  })

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

  it('inclui a resolução DNS no prazo absoluto', async () => {
    vi.useFakeTimers()
    try {
      const transport = new FakeTransport([])
      const fetch = new SafePageFetcher(transport, async () => new Promise(() => undefined), { timeoutMs: 20, maxBytes: 1024, maxRedirects: 1 }).fetch('https://slow.example/obra')
      const timeoutExpectation = expect(fetch).rejects.toMatchObject({ code: 'URL_FETCH_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(20)
      await timeoutExpectation
      expect(transport.calls).toHaveLength(0)
    } finally { vi.useRealTimers() }
  })

  it.each([
    [403, 'URL_ACCESS_DENIED'],
    [404, 'URL_NOT_FOUND'],
    [503, 'URL_SERVER_ERROR']
  ])('traduz HTTP %i para um erro útil', async (statusCode, code) => {
    const transport = new FakeTransport([{ statusCode, headers: {}, body: Buffer.alloc(0) }])
    await expect(new SafePageFetcher(transport, publicResolver).fetch('https://safe.example/obra'))
      .rejects.toMatchObject({ code })
  })

  it('reaplica a validação completa em uma tentativa posterior', async () => {
    let resolutions = 0
    const resolver = async () => (++resolutions === 1 ? ['10.0.0.8'] : ['93.184.216.34'])
    const transport = new FakeTransport([htmlResponse('<html><title>Recuperada</title></html>')])
    const fetcher = new SafePageFetcher(transport, resolver)
    await expect(fetcher.fetch('https://retry.example/obra')).rejects.toMatchObject({ code: 'URL_DESTINATION_BLOCKED' })
    await expect(fetcher.fetch('https://retry.example/obra')).resolves.toMatchObject({ finalUrl: 'https://retry.example/obra' })
    expect(resolutions).toBe(2)
    expect(transport.calls).toHaveLength(1)
  })
})

describe('extração genérica de metadata HTML', () => {
  it('descarta metadata global quando uma URL específica colapsa para a homepage', () => {
    const result = extractPageMetadata(`
      <html><head>
        <title>ToonLivre | Manhwas e Webtoons em português</title>
        <meta name="description" content="Leia manhwas e webtoons em português.">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="ToonLivre">
        <meta property="og:title" content="ToonLivre | Manhwas e Webtoons em português">
        <meta property="og:description" content="Leia manhwas e webtoons em português.">
        <meta property="og:image" content="/logo.png">
        <meta property="og:url" content="https://reader.example/">
        <meta name="twitter:title" content="ToonLivre | Manhwas e Webtoons em português">
        <meta name="twitter:description" content="Leia manhwas e webtoons em português.">
        <link rel="canonical" href="https://reader.example/">
        <script type="application/ld+json">{
          "@type": "WebSite", "name": "ToonLivre",
          "description": "Leia manhwas e webtoons em português."
        }</script>
      </head></html>
    `, 'https://reader.example/contos-de-demonios-e-deuses', 'https://reader.example/contos-de-demonios-e-deuses')

    expect(result).toMatchObject({
      finalUrl: 'https://reader.example/contos-de-demonios-e-deuses', siteName: 'ToonLivre',
      title: null, description: null, canonicalUrl: null, coverUrl: null
    })
  })

  it('usa Twitter Cards específicas mesmo quando Open Graph e canonical são globais', () => {
    const result = extractPageMetadata(`
      <html><head>
        <title>Reader — quadrinhos online</title>
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="Reader">
        <meta property="og:title" content="Reader — quadrinhos online">
        <meta property="og:url" content="https://reader.example/">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="The Shepherd Wizard">
        <meta name="twitter:description" content="A história específica da obra.">
        <meta name="twitter:image" content="/covers/shepherd.jpg">
        <link rel="canonical" href="https://reader.example/">
      </head></html>
    `, 'https://reader.example/work/shepherd', 'https://reader.example/work/shepherd')

    expect(result).toMatchObject({
      title: 'The Shepherd Wizard', description: 'A história específica da obra.',
      coverUrl: 'https://reader.example/covers/shepherd.jpg', canonicalUrl: null
    })
  })

  it('usa um h1 único como fallback sem herdar descrição ou capa globais', () => {
    const result = extractPageMetadata(`
      <html><head>
        <title>Reader — quadrinhos online</title>
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="Reader">
        <meta property="og:title" content="Reader — quadrinhos online">
        <meta property="og:description" content="Descrição genérica do catálogo.">
        <meta property="og:image" content="/logo.png">
        <link rel="canonical" href="https://reader.example/">
      </head><body><main><h1>Contos de Demônios e Deuses</h1></main></body></html>
    `, 'https://reader.example/contos', 'https://reader.example/contos')

    expect(result).toMatchObject({
      title: 'Contos de Demônios e Deuses', description: null, coverUrl: null, canonicalUrl: null
    })
  })

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
