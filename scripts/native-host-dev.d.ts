export interface RegistryAdapter {
  readDefault(registryKey: string): string | null
  setDefault(registryKey: string, manifestPath: string): void
  deleteKey(registryKey: string): void
}

export interface RegistryCommandResult { status: number; stdout: string; stderr: string }
export interface DevHostManifest { name: string; description: string; path: string; type: 'stdio'; allowed_origins: string[] }

export const DEV_NATIVE_HOST_NAME: 'app.auri.native_host.dev'
export const DEV_NATIVE_HOST_DESCRIPTION: string
export const CHROME_DEV_REGISTRY_KEY: string
export const EDGE_DEV_REGISTRY_KEY: string
export function validateExtensionId(value: string): string
export function extensionOrigin(extensionId: string): string
export function resolveDevIntegrationPaths(projectRoot?: string): { directory: string; executablePath: string; manifestPath: string }
export function createDevHostManifest(executablePath: string, extensionIds: string[]): DevHostManifest
export function parseRegisterArguments(argumentsList: string[]): { chromeExtensionId?: string; edgeExtensionId?: string }
export function parseUnregisterArguments(argumentsList: string[]): { chrome: boolean; edge: boolean }
export function createRegistryAdapter(run?: (argumentsList: string[]) => RegistryCommandResult): RegistryAdapter
export function registerDevelopmentHost(
  options: { projectRoot?: string; chromeExtensionId?: string; edgeExtensionId?: string },
  dependencies?: { registry?: RegistryAdapter }
): { directory: string; executablePath: string; manifestPath: string; manifest: DevHostManifest; browsers: string[] }
export function unregisterDevelopmentHost(
  options?: { projectRoot?: string; browsers?: { chrome: boolean; edge: boolean } },
  dependencies?: { registry?: RegistryAdapter }
): { manifestPath: string; removed: string[]; skipped: string[] }
