import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  calculateExtensionId,
  prepareDevelopmentExtension,
  resolveDevelopmentExtensionPaths,
  validateDevelopmentConfig
} from '../../scripts/dev/extension-setup.mjs'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('preparação da Auri Extension DEV', () => {
  it('aplica identidade DEV estável e mantém somente o host .dev no bundle', () => {
    const root = temporaryRoot()
    const source = createExtensionBuild(root, 'const host = "app.auri.native_host.dev"')
    const output = join(root, 'prepared')
    const result = prepareDevelopmentExtension(source, output)
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')) as Record<string, unknown>

    expect(result.extensionId).toBe('lfneneebngmiikddoddnlcgobfjkodpm')
    expect(calculateExtensionId(String(manifest.key))).toBe(result.extensionId)
    expect(manifest).toMatchObject({ name: 'Auri Extension DEV', version: '0.2.0', version_name: '0.2.0 DEV' })
    expect(result.extensionId).not.toBe('agefiaohfielfgadiagemnflekbboblp')
    expect(result.extensionId).not.toBe('alnngjgmhiebpnjefjmhbhmhfpgoibnh')
  })

  it('recusa bundle DEV contaminado pelo host PROD', () => {
    const root = temporaryRoot()
    const source = createExtensionBuild(root, 'const host = "app.auri.native_host"; const dev = "app.auri.native_host.dev"')
    expect(() => prepareDevelopmentExtension(source, join(root, 'prepared'))).toThrow(/Host PROD/)
  })

  it('resolve os diretórios irmãos e valida fingerprint sem usar ID histórico', () => {
    const root = temporaryRoot()
    const extensionRoot = join(root, 'Auri-Extension')
    expect(resolveDevelopmentExtensionPaths(join(root, 'Auri'), extensionRoot)).toEqual({
      extensionRoot,
      extensionBuild: join(extensionRoot, 'artifacts', 'dev-native'),
      outputDirectory: join(root, 'Auri', 'build', 'generated', 'browser-extension-dev')
    })
    expect(validateDevelopmentConfig()).toMatchObject({ extensionId: 'lfneneebngmiikddoddnlcgobfjkodpm' })
    expect(validateDevelopmentConfig().extensionId).not.toBe('kldacocmhefloboachmkpeojenaaocek')
  })
})

function temporaryRoot(): string {
  const root = join(tmpdir(), `auri-extension-dev-${randomUUID()}`)
  roots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

function createExtensionBuild(root: string, javascript: string): string {
  const source = join(root, 'source')
  mkdirSync(join(source, 'assets'), { recursive: true })
  writeFileSync(join(source, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '__MSG_extensionName__',
    version: '0.2.0',
    permissions: ['activeTab', 'scripting', 'nativeMessaging']
  }))
  writeFileSync(join(source, 'assets', 'popup.js'), javascript)
  return source
}
