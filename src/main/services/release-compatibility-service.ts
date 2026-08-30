import { DomainError } from '@shared/errors/domain-error'
import type { UpdateService } from './update-service'

export const LATEST_RELEASE_COMPATIBILITY_URL = 'https://github.com/Fish7w7/Auri/releases/latest/download/auri-compatibility.json'

export interface ReleaseCompatibilityManifest {
  version: string
  minSchema: number
  maxSchema: number
}

export interface CompatibilityManifestProvider {
  load(): Promise<unknown | null>
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type CompatibilityRecoveryStatus =
  | 'checking'
  | 'compatible_update_available'
  | 'unconfirmed_update_available'
  | 'incompatible_update_available'
  | 'no_update'
  | 'offline'
  | 'error'
  | 'downloading'
  | 'ready'

export interface CompatibilityRecoveryState {
  status: CompatibilityRecoveryStatus
  installedVersion: string
  databaseSchema: number
  supportedSchema: number
  availableVersion: string | null
  manifest: ReleaseCompatibilityManifest | null
  manifestIssue: 'missing' | 'invalid' | 'version_mismatch' | null
  message: string
}

export function parseReleaseCompatibilityManifest(input: unknown): ReleaseCompatibilityManifest {
  let value: unknown = input
  if (typeof input === 'string') {
    try { value = JSON.parse(input) }
    catch { throw new DomainError('UPDATE_CHECK_FAILED', 'O manifesto de compatibilidade não contém JSON válido.') }
  }
  if (!value || typeof value !== 'object') throw new DomainError('UPDATE_CHECK_FAILED', 'O manifesto de compatibilidade está ausente ou inválido.')
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(candidate.version) ||
    !Number.isInteger(candidate.minSchema) || !Number.isInteger(candidate.maxSchema) ||
    (candidate.minSchema as number) < 0 || (candidate.minSchema as number) > (candidate.maxSchema as number)
  ) {
    throw new DomainError('UPDATE_CHECK_FAILED', 'O manifesto de compatibilidade possui campos inválidos.')
  }
  return {
    version: candidate.version,
    minSchema: candidate.minSchema as number,
    maxSchema: candidate.maxSchema as number
  }
}

export async function fetchLatestReleaseCompatibilityManifest(
  fetcher: (url: string) => Promise<FetchResponseLike>
): Promise<unknown | null> {
  const response = await fetcher(LATEST_RELEASE_COMPATIBILITY_URL)
  if (response.status === 404) return null
  if (!response.ok) throw new DomainError('UPDATE_CHECK_FAILED', 'Não foi possível consultar a compatibilidade da atualização.')
  return response.text()
}

export class CompatibilityRecoveryService {
  private state: CompatibilityRecoveryState

  constructor(
    private readonly updates: UpdateService,
    private readonly manifests: CompatibilityManifestProvider,
    input: { installedVersion: string; databaseSchema: number; supportedSchema: number }
  ) {
    this.state = {
      status: 'checking',
      ...input,
      availableVersion: null,
      manifest: null,
      manifestIssue: null,
      message: 'Verificando se há uma atualização compatível...'
    }
  }

  getState(): CompatibilityRecoveryState { return { ...this.state } }

  async check(): Promise<CompatibilityRecoveryState> {
    this.patch({ status: 'checking', message: 'Verificando se há uma atualização compatível...', manifest: null, manifestIssue: null })
    try {
      const update = await this.updates.checkForUpdates()
      if (update.status !== 'available' && update.status !== 'ready') {
        if (update.status === 'up_to_date') {
          return this.patch({ status: 'no_update', availableVersion: null, message: 'Nenhuma atualização foi encontrada no canal atual.' })
        }
        return this.patch({ status: 'error', availableVersion: update.availableVersion, message: update.errorMessage ?? 'O updater não está disponível nesta instalação.' })
      }

      const availableVersion = update.availableVersion
      if (!availableVersion) return this.patch({ status: 'error', message: 'O updater não informou a versão disponível.' })

      let rawManifest: unknown | null
      try { rawManifest = await this.manifests.load() }
      catch (error) {
        if (error instanceof DomainError && error.details?.offline === true) throw error
        return this.patch({
          status: 'unconfirmed_update_available', availableVersion, manifestIssue: 'missing',
          message: `O Auri ${availableVersion} está disponível, mas não foi possível confirmar se ele suporta esta biblioteca.`
        })
      }
      if (rawManifest === null) {
        return this.patch({
          status: 'unconfirmed_update_available', availableVersion, manifestIssue: 'missing',
          message: `O Auri ${availableVersion} está disponível, mas não publicou informações de compatibilidade.`
        })
      }

      let manifest: ReleaseCompatibilityManifest
      try { manifest = parseReleaseCompatibilityManifest(rawManifest) }
      catch {
        return this.patch({
          status: 'unconfirmed_update_available', availableVersion, manifestIssue: 'invalid',
          message: `O Auri ${availableVersion} está disponível, mas suas informações de compatibilidade são inválidas.`
        })
      }
      if (manifest.version !== availableVersion) {
        return this.patch({
          status: 'unconfirmed_update_available', availableVersion, manifest, manifestIssue: 'version_mismatch',
          message: `O Auri ${availableVersion} está disponível, mas as informações publicadas pertencem a outra versão.`
        })
      }

      const compatible = this.state.databaseSchema >= manifest.minSchema && this.state.databaseSchema <= manifest.maxSchema
      if (!compatible) {
        return this.patch({
          status: 'incompatible_update_available', availableVersion, manifest,
          message: `O Auri ${availableVersion} está disponível, mas ainda não suporta o schema ${this.state.databaseSchema}.`
        })
      }
      return this.patch({
        status: update.status === 'ready' ? 'ready' : 'compatible_update_available', availableVersion, manifest,
        message: `O Auri ${availableVersion} está disponível e é compatível com sua biblioteca.`
      })
    } catch (error) {
      const offline = error instanceof DomainError && error.details?.offline === true
      return this.patch({
        status: offline ? 'offline' : 'error',
        message: offline
          ? 'Não foi possível verificar atualizações porque o computador está sem conexão.'
          : 'Não foi possível verificar atualizações agora.'
      })
    }
  }

  async download(): Promise<CompatibilityRecoveryState> {
    if (this.state.status !== 'compatible_update_available') throw new DomainError('UPDATE_DOWNLOAD_FAILED', 'A compatibilidade desta atualização ainda não foi confirmada.')
    this.patch({ status: 'downloading', message: `Baixando o Auri ${this.state.availableVersion}...` })
    try {
      const update = await this.updates.downloadUpdate()
      return this.patch({
        status: update.status === 'ready' ? 'ready' : 'downloading',
        message: update.status === 'ready' ? 'Atualização pronta para instalar e reiniciar.' : 'Download da atualização em andamento.'
      })
    } catch (error) {
      const offline = error instanceof DomainError && error.details?.offline === true
      return this.patch({
        status: offline ? 'offline' : 'error',
        message: offline ? 'O download não pôde começar porque o computador está sem conexão.' : 'Não foi possível baixar a atualização.'
      })
    }
  }

  install(): void {
    if (this.state.status !== 'ready') throw new DomainError('UPDATE_INSTALL_BLOCKED', 'A atualização ainda não está pronta para instalar.')
    this.updates.installUpdate()
  }

  private patch(patch: Partial<CompatibilityRecoveryState>): CompatibilityRecoveryState {
    this.state = { ...this.state, ...patch }
    return this.getState()
  }
}
