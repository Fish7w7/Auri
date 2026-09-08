export const embeddedConfig: { zipPath: string; metadataPath: string; sha256: string; metadataSha256: string; publicKeySha256: string; version: string; extensionId: string; edgeExtensionId: string; edgeStoreUrl: string }
export interface EmbeddedIntegrity { version: string; extensionId: string; sha256: string; filesCount: number; files: Record<string, string> }
export function sha256(bytes: Buffer): string
export function readZip(bytes: Buffer): Promise<Map<string, Buffer>>
export function validateEdgeStoreUrl(value: string): string
export function validateEmbeddedFiles(files: Map<string, Buffer>, config?: typeof embeddedConfig): EmbeddedIntegrity
export function validateEmbeddedInput(zip: Buffer, metadata: Buffer, config?: typeof embeddedConfig): Promise<{ files: Map<string, Buffer>; metadata: EmbeddedIntegrity }>
export function prepareEmbedded(): Promise<EmbeddedIntegrity>
