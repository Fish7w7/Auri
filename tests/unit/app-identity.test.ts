import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_USER_MODEL_ID } from '@main/app/app-identity'

interface PackageIdentity {
  name: string
  version: string
  author: string
  repository: { url: string }
  build: {
    appId: string
    productName: string
    artifactName: string
    win: { icon: string }
    nsis: { shortcutName: string; installerIcon: string; uninstallerIcon: string; installerHeaderIcon: string }
    publish: Array<{ owner: string; repo: string }>
  }
}

describe('identidade do aplicativo Auri', () => {
  it('usa uma identidade técnica nova e coerente em todo o empacotamento', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as PackageIdentity

    expect(manifest.version).toBe('1.2.0')
    expect(manifest.author).toBe('Auri')
    expect(manifest.build.productName).toBe('Auri')
    expect(manifest.build.artifactName).toBe('Auri-Setup-${version}-${arch}.${ext}')
    expect(manifest.build.win.icon).toBe('build/icon.ico')
    expect(manifest.build.nsis).toMatchObject({ shortcutName: 'Auri', installerIcon: 'build/icon.ico', uninstallerIcon: 'build/icon.ico', installerHeaderIcon: 'build/icon.ico' })
    expect(existsSync(join(process.cwd(), 'src/renderer/public/auri-icon.svg'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'build/icon.ico'))).toBe(true)
    expect(manifest.name).toBe('auri-desktop')
    expect(manifest.build.appId).toBe('app.auri.desktop')
    expect(APP_USER_MODEL_ID).toBe(manifest.build.appId)
    expect(manifest.repository.url).toBe('https://github.com/Fish7w7/Auri.git')
    expect(manifest.build.publish).toContainEqual(expect.objectContaining({ owner: 'Fish7w7', repo: 'Auri' }))
  })
})