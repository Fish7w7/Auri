import { shell } from 'electron'
import { openExternalSchema } from '@shared/schemas/domain'
import { parseDomainInput } from './service-utils'
import { validateExternalUrl } from './external-url'

export class ExternalNavigationService {
  async open(input: unknown): Promise<void> {
    const request = parseDomainInput(openExternalSchema, input)
    await shell.openExternal(validateExternalUrl(request.url).toString())
  }
}
