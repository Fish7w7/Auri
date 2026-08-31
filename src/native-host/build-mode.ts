export type NativeHostBuildMode = 'prod' | 'dev'

declare const __AURI_NATIVE_HOST_BUILD_MODE__: NativeHostBuildMode | undefined

export const NATIVE_HOST_BUILD_MODE: NativeHostBuildMode = normalizeNativeHostBuildMode(
  typeof __AURI_NATIVE_HOST_BUILD_MODE__ === 'undefined' ? 'prod' : __AURI_NATIVE_HOST_BUILD_MODE__
)

export function normalizeNativeHostBuildMode(value: unknown): NativeHostBuildMode {
  return value === 'dev' ? 'dev' : 'prod'
}

export function isDevelopmentNativeHost(mode: NativeHostBuildMode): boolean {
  return mode === 'dev'
}

