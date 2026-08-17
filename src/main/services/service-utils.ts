import { randomUUID } from 'node:crypto'
import { ZodError, type ZodType } from 'zod'
import { DomainError, type DomainErrorCode } from '@shared/errors/domain-error'

export type IdGenerator = () => string
export type Clock = () => string

export const generateId: IdGenerator = () => randomUUID()
export const utcNow: Clock = () => new Date().toISOString()

export function parseDomainInput<T>(schema: ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input)
  } catch (error) {
    if (!(error instanceof ZodError)) throw error

    const first = error.issues[0]
    const field = String(first?.path[0] ?? '')
    let code: DomainErrorCode = 'INVALID_INPUT'
    if (field === 'mediaType') code = 'INVALID_MEDIA_TYPE'
    if (field === 'userStatus' || field === 'publicationStatus' || field === 'status') {
      code = 'INVALID_STATUS'
    }
    if (field === 'chapter' || field === 'chapterLabel') code = 'INVALID_CHAPTER'

    throw new DomainError(code, first?.message ?? 'Entrada inválida.', { field })
  }
}

export function requireText(value: string | null | undefined): string | null {
  return value ?? null
}

