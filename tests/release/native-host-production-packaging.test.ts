import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('pipeline de empacotamento do Native Host PROD', () => {
  it('empacota o host fora do ASAR e preserva os comandos DEV', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
      build: {
        extraResources: Array<{ from: string; to: string }>
        nsis: { include: string; perMachine: boolean }
        afterAllArtifactBuild: string
      }
    }
    expect(packageJson.build.extraResources).toContainEqual({
      from: 'artifacts/native-host/AuriNativeHost.exe',
      to: 'native-host/AuriNativeHost.exe'
    })
    expect(packageJson.build.nsis).toMatchObject({ include: 'build/nsis/installer.nsh', perMachine: false })
    expect(packageJson.build.afterAllArtifactBuild).toBe('scripts/release/after-all-artifact-build.cjs')
    expect(packageJson.scripts['release:win']).toMatch(/build:native-host.*build:app.*prepare:native-host:release.*electron-builder/)
    expect(packageJson.scripts['build:native-host:dev']).toBe('node scripts/build/build-native-host.mjs --mode=dev')
    expect(packageJson.scripts['native-host:register-dev']).toBe('node scripts/dev/native-host.js register')
    expect(packageJson.scripts['native-host:unregister-dev']).toBe('node scripts/dev/native-host.js unregister')
  })

  it('mantém o include versionado sem IDs, chaves ou referências DEV', () => {
    const include = readFileSync(join(process.cwd(), 'build', 'nsis', 'installer.nsh'), 'utf8')
    const config = readFileSync(join(process.cwd(), 'build', 'native-host', 'production.config.json'), 'utf8')
    expect(include).toContain('installer-generated.nsh')
    expect(include).not.toContain('NativeMessagingHosts')
    expect(config).toContain('AURI_EXTENSION_CHROME_ID')
    expect(config).toContain('AURI_EXTENSION_EDGE_ID')
    expect(config).toContain('AURI_EXTENSION_BRAVE_ID')
    expect(config).not.toMatch(/[a-p]{32}/)
    expect(`${include}\n${config}`).not.toContain('app.auri.native_host.dev')
  })

  it('faz o build PROD falhar se o executável conservar referências DEV', () => {
    const buildScript = readFileSync(join(process.cwd(), 'scripts', 'build', 'build-native-host.mjs'), 'utf8')
    expect(buildScript).toContain("if (mode === 'prod') assertProductionExecutable(executablePath)")
    expect(buildScript).toContain("'app.auri.native_host.dev', 'AuriNativeHostDev.exe', 'Auri-Dev'")
  })

  it('gera o manifesto de compatibilidade a partir da fonte única da raiz', () => {
    const generator = readFileSync(join(process.cwd(), 'scripts', 'build', 'generate-compatibility-manifest.mjs'), 'utf8')
    const artifactHook = readFileSync(join(process.cwd(), 'scripts', 'release', 'after-all-artifact-build.cjs'), 'utf8')
    expect(generator).toContain("'schema-compatibility.json'")
    expect(generator).toContain("'build', 'generated', 'auri-compatibility.json'")
    expect(artifactHook).toContain("'build', 'generated', 'auri-compatibility.json'")
  })
})
