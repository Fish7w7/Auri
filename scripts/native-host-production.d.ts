export interface ProductionRegistryAdapter {
  readDefault(registryKey: string): string | null
  setDefault(registryKey: string, manifestPath: string): void
  deleteKey(registryKey: string): void
}

export interface ProductionNativeHostConfig {
  extensionIdEnvironmentVariables: Record<'chrome' | 'edge' | 'brave', string>
}

export const PROD_NATIVE_HOST_NAME: 'app.auri.native_host'
export const PROD_NATIVE_HOST_DESCRIPTION: string
export const CHROME_PROD_REGISTRY_KEY: string
export const EDGE_PROD_REGISTRY_KEY: string
export const BRAVE_PROD_REGISTRY_KEY: string
export function validateProductionExtensionId(value: string): string
export function extensionOrigin(extensionId: string): string
export function loadProductionExtensionConfiguration(
  environment?: Record<string, string | undefined>,
  config?: ProductionNativeHostConfig
): { mode: 'release' | 'test'; byBrowser: Record<string, string>; extensionIds: string[]; allowedOrigins: string[] }
export function createProductionHostManifest(executablePath: string, extensionIds: string[]): {
  name: string; description: string; path: string; type: 'stdio'; allowed_origins: string[]
}
export function productionRegistrations(manifestPath: string): Array<{ browser: string; key: string; manifestPath: string }>
export function installProductionRegistrations(registry: ProductionRegistryAdapter, manifestPath: string): Array<{ browser: string; key: string; manifestPath: string }>
export function uninstallProductionRegistrations(registry: ProductionRegistryAdapter, manifestPath: string): { removed: string[]; skipped: string[] }
export function createProductionInstallerInclude(allowedOrigins: string[]): string
export function prepareProductionPackaging(options?: {
  projectRoot?: string
  environment?: Record<string, string | undefined>
  config?: ProductionNativeHostConfig
  requireRelease?: boolean
}): {
  executablePath: string; includePath: string; metadataPath: string; mode: 'release' | 'test';
  byBrowser: Record<string, string>; extensionIds: string[]; allowedOrigins: string[]
}
