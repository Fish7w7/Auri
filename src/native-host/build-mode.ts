export type NativeHostBuildMode = 'prod' | 'dev'

declare const __AURI_NATIVE_HOST_BUILD_MODE__: NativeHostBuildMode | undefined
declare const __AURI_NATIVE_HOST_USER_DATA_DIRECTORY__: string | undefined
declare const __AURI_NATIVE_HOST_PIPE_PREFIX__: string | undefined

export const NATIVE_HOST_BUILD_MODE: NativeHostBuildMode =
  typeof __AURI_NATIVE_HOST_BUILD_MODE__ === 'undefined' ? 'prod' : __AURI_NATIVE_HOST_BUILD_MODE__

export const NATIVE_HOST_USER_DATA_DIRECTORY = typeof __AURI_NATIVE_HOST_USER_DATA_DIRECTORY__ === 'undefined'
  ? (NATIVE_HOST_BUILD_MODE === 'dev' ? 'Auri-Dev' : 'Auri')
  : __AURI_NATIVE_HOST_USER_DATA_DIRECTORY__
export const NATIVE_HOST_PIPE_PREFIX = typeof __AURI_NATIVE_HOST_PIPE_PREFIX__ === 'undefined'
  ? (NATIVE_HOST_BUILD_MODE === 'dev' ? 'auri-desktop-dev' : 'auri-desktop')
  : __AURI_NATIVE_HOST_PIPE_PREFIX__

export function normalizeNativeHostBuildMode(value: unknown): NativeHostBuildMode {
  return value === 'dev' ? 'dev' : 'prod'
}

export function isDevelopmentNativeHost(mode: NativeHostBuildMode): boolean {
  return mode === 'dev'
}
