export interface DevelopmentExtensionConfig {
  publicKey: string
  extensionId: string
  publicKeySha256: string
}

export function calculateExtensionId(publicKey: string): string
export function validateDevelopmentConfig(config?: DevelopmentExtensionConfig): { extensionId: string; fingerprint: string }
export function prepareDevelopmentExtension(
  sourceDirectory: string,
  outputDirectory: string,
  config?: DevelopmentExtensionConfig
): { extensionId: string; fingerprint: string; outputDirectory: string; manifestPath: string; manifest: Record<string, unknown> }
export function resolveDevelopmentExtensionPaths(projectRoot?: string, extensionRoot?: string): {
  extensionRoot: string
  extensionBuild: string
  outputDirectory: string
}
