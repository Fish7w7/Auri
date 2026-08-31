import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isDevelopmentNativeHost, NATIVE_HOST_BUILD_MODE, normalizeNativeHostBuildMode } from '../../src/native-host/build-mode'
import { resolveBridgeUserData } from '@shared/native-bridge/identity'

describe('modo de build do Native Host', () => {
  it('usa PROD por padrão e diferencia PROD/DEV sem inferir pelo ambiente', () => {
    expect(NATIVE_HOST_BUILD_MODE).toBe('prod')
    expect(normalizeNativeHostBuildMode('prod')).toBe('prod')
    expect(normalizeNativeHostBuildMode('dev')).toBe('dev')
    expect(normalizeNativeHostBuildMode('qualquer-outro-valor')).toBe('prod')
    expect(isDevelopmentNativeHost('prod')).toBe(false)
    expect(isDevelopmentNativeHost('dev')).toBe(true)
  })

  it('resolve o artefato DEV exclusivamente para Auri-Dev', () => {
    expect(resolveBridgeUserData('C:\\Users\\test\\AppData\\Roaming', isDevelopmentNativeHost('dev'))).toContain('Auri-Dev')
    expect(resolveBridgeUserData('C:\\Users\\test\\AppData\\Roaming', isDevelopmentNativeHost('dev'))).not.toMatch(/[\\/]Auri$/)
  })

  it('mantém build e registro como comandos separados', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const buildScript = readFileSync(join(process.cwd(), 'scripts', 'build-native-host.mjs'), 'utf8')
    expect(packageJson.scripts['build:native-host']).toBe('node scripts/build-native-host.mjs')
    expect(packageJson.scripts['build:native-host:dev']).toBe('node scripts/build-native-host.mjs --mode=dev')
    expect(packageJson.scripts['build:native-host:dev']).not.toContain('register')
    expect(buildScript).not.toContain('reg.exe')
  })
})

