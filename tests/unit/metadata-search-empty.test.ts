import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NoMetadataResults } from '@renderer/components/work/AddWorkDialog'

describe('estado vazio da pesquisa de metadados', () => {
  it('orienta sobre outros títulos e mantém retry e cadastro manual disponíveis', () => {
    const html = renderToStaticMarkup(createElement(NoMetadataResults, { onRetry() {}, onManual() {} }))
    expect(html).toContain('Nenhum resultado encontrado.')
    expect(html).toContain('título em inglês;')
    expect(html).toContain('título romanizado;')
    expect(html).toContain('título original.')
    expect(html).toContain('pesquisando o título na web')
    expect(html).toContain('Tentar outro título')
    expect(html).toContain('Adicionar manualmente')
    expect(html).not.toContain('Google')
  })
})
