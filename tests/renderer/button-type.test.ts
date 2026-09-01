import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from '@renderer/components/ui/Button'

describe('tipo do botão compartilhado', () => {
  it('usa type="button" por padrão, inclusive dentro de formulário', () => {
    const html = renderToStaticMarkup(createElement('form', null,
      createElement(Button, { children: 'Tentar novamente' })
    ))

    expect(html).toContain('<button type="button"')
    expect(html).not.toContain('<button type="submit"')
  })

  it('preserva type="submit" quando fornecido explicitamente', () => {
    const html = renderToStaticMarkup(createElement(Button, { type: 'submit', children: 'Enviar' }))

    expect(html).toContain('<button type="submit"')
  })
})
