export const NATIVE_BRIDGE_START_FLAG = '--native-bridge-start'

export function isNativeBridgeStartup(commandLine: readonly string[]): boolean {
  return commandLine.includes(NATIVE_BRIDGE_START_FLAG)
}

export function shouldRestoreWindowForSecondInstance(commandLine: readonly string[]): boolean {
  return !isNativeBridgeStartup(commandLine)
}
