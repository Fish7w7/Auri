import { createHash } from 'node:crypto'
import { readFile, lstat, readdir } from 'node:fs/promises'
import { join, resolve, isAbsolute, relative } from 'node:path'
import { DomainError } from '@shared/errors/domain-error'
import { BROWSER_EXTENSIONS_URLS, SUPPORTED_BROWSERS, type BrowserExtensionStatus, type SupportedBrowser, type BrowserOpenResult } from '@shared/contracts/browser-extension'
import { BROWSER_DEFINITIONS } from './browser-detection'
import config from '../../../build/browser-extension.config.json'
import integrity from '../../../build/generated/browser-extension-integrity.json'

export interface BrowserExtensionDependencies {
  folder: string
  detect(): Promise<Record<SupportedBrowser, string | null>>
  embeddedAvailable(): Promise<boolean>
  launch(executable: string, args: string[]): Promise<void>
  isRunning(browser: SupportedBrowser): Promise<boolean>
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<string>
  copyText(text: string): void
}

export async function verifyEmbeddedDirectory(folder: string): Promise<boolean> {
  try {
    if ((await lstat(folder)).isSymbolicLink()) return false
    const expected = new Map(Object.entries(integrity.files))
    const walk = async (directory: string): Promise<boolean> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) return false
        const path = join(directory, entry.name)
        if (entry.isDirectory()) { if (!await walk(path)) return false; continue }
        const name = relative(folder, path).replaceAll('\\', '/')
        if (!entry.isFile() || !expected.has(name)) return false
        if (createHash('sha256').update(await readFile(path)).digest('hex') !== expected.get(name)) return false
        expected.delete(name)
      }
      return true
    }
    return await walk(folder) && expected.size === 0
  } catch { return false }
}

export function embeddedDirectory(isPackaged: boolean, resourcesPath: string, appPath: string): string {
  return isPackaged ? join(resourcesPath, 'browser-extension') : resolve(appPath, 'build/generated/browser-extension')
}

export class BrowserExtensionService {
  private readonly opening = new Map<SupportedBrowser, Promise<BrowserOpenResult>>()
  constructor(private readonly deps: BrowserExtensionDependencies) {
    if (!isAbsolute(deps.folder)) throw new Error('Embedded directory must be absolute.')
  }

  async getStatus(): Promise<BrowserExtensionStatus> {
    const [detected, embeddedAvailable] = await Promise.all([this.deps.detect(), this.deps.embeddedAvailable()])
    return {
      embeddedVersion: integrity.version,
      embeddedAvailable,
      browsers: SUPPORTED_BROWSERS.map((browser) => ({
        browser, displayName: BROWSER_DEFINITIONS[browser].displayName, installed: Boolean(detected[browser]),
        availableAction: !detected[browser] ? null : browser === 'edge' ? (config.edgeStoreUrl ? 'store' : null) : embeddedAvailable ? 'manual' : null
      }))
    }
  }

  async openEdgeStore(): Promise<void> {
    await this.perform(async () => {
      await this.requireBrowser('edge')
      const url = new URL(config.edgeStoreUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'microsoftedge.microsoft.com' || url.username || url.password || url.port || !url.pathname.startsWith('/addons/detail/')) throw new Error('Invalid store')
      await this.deps.openExternal(url.href)
    })
  }

  async openExtensionsPage(value: unknown): Promise<BrowserOpenResult> {
    if (typeof value !== 'string' || !SUPPORTED_BROWSERS.includes(value as SupportedBrowser)) throw new DomainError('INVALID_INPUT', 'Navegador não suportado.')
    const browser = value as SupportedBrowser
    const pending = this.opening.get(browser)
    if (pending) return pending
    const operation = this.perform<BrowserOpenResult>(async () => {
      const executable = await this.requireBrowser(browser)
      try {
        if (await this.deps.isRunning(browser)) return { state: 'already-running' }
      } catch {
        // Failure to inspect is not proof that the browser is closed.
        return { state: 'unknown' }
      }
      await this.deps.launch(executable, [BROWSER_DEFINITIONS[browser].url])
      return { state: 'launch-requested' }
    })
    this.opening.set(browser, operation)
    try { return await operation } finally { this.opening.delete(browser) }
  }

  async openFolder(): Promise<void> {
    await this.perform(async () => {
      await this.requireEmbedded()
      if (await this.deps.openPath(this.deps.folder)) throw new Error('Open folder failed')
    })
  }

  async copyPath(): Promise<void> {
    await this.perform(async () => { await this.requireEmbedded(); this.deps.copyText(this.deps.folder) })
  }

  async copyExtensionsUrl(value: unknown): Promise<void> {
    if (typeof value !== 'string' || !SUPPORTED_BROWSERS.includes(value as SupportedBrowser)) throw new DomainError('INVALID_INPUT', 'Navegador não suportado.')
    await this.perform(async () => { this.deps.copyText(BROWSER_EXTENSIONS_URLS[value as SupportedBrowser]) })
  }

  private async requireBrowser(browser: SupportedBrowser): Promise<string> {
    const executable = (await this.deps.detect())[browser]
    if (!executable) throw new DomainError('INVALID_INPUT', 'Navegador não encontrado neste computador. Tente novamente.')
    return executable
  }

  private async requireEmbedded(): Promise<void> {
    if (!await this.deps.embeddedAvailable()) throw new DomainError('SYSTEM_FOLDER_UNAVAILABLE', 'Os arquivos da Auri Extension não estão disponíveis nesta instalação. Atualize ou reinstale o Auri.')
  }

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation() } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError('INTERNAL_ERROR', 'Não foi possível concluir a ação. Tente novamente.')
    }
  }
}
