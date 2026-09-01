import { describe, expect, it } from 'vitest'
import { normalizeChapter, normalizeChapterInput } from '@shared/utils/normalize-chapter'

describe('normalizeChapter', () => {
  it('normaliza capítulos inteiros e decimais', () => {
    expect(normalizeChapter('00184')).toEqual({ label: '184', numericValue: 184 })
    expect(normalizeChapter('10,5')).toEqual({ label: '10.5', numericValue: 10.5 })
  })

  it('aceita capítulos textuais sem atribuir ordem numérica', () => {
    expect(normalizeChapter('  Especial   2 ')).toEqual({
      label: 'Especial 2',
      numericValue: null
    })
    expect(normalizeChapter('Prólogo')).toEqual({ label: 'Prólogo', numericValue: null })
    expect(normalizeChapter('10A')).toEqual({ label: '10A', numericValue: null })
  })

  it('rejeita capítulos vazios', () => {
    expect(() => normalizeChapter('   ')).toThrow('não pode estar vazio')
  })

  it('expõe o formato de domínio label/number sem interpretar texto arbitrariamente', () => {
    expect(normalizeChapterInput('183')).toEqual({ label: '183', number: 183 })
    expect(normalizeChapterInput('183.5')).toEqual({ label: '183.5', number: 183.5 })
    expect(normalizeChapterInput(' 183 ')).toEqual({ label: '183', number: 183 })
    expect(normalizeChapterInput('Prólogo')).toEqual({ label: 'Prólogo', number: null })
    expect(normalizeChapterInput('10A')).toEqual({ label: '10A', number: null })
    expect(normalizeChapterInput('Side Story 4')).toEqual({ label: 'Side Story 4', number: null })
  })
})
