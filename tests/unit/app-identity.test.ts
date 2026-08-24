import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
    nsis: { shortcutName: string }
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
    expect(manifest.build.nsis.shortcutName).toBe('Auri')
    expect(manifest.name).toBe('auri-desktop')
    expect(manifest.build.appId).toBe('app.auri.desktop')
    expect(APP_USER_MODEL_ID).toBe(manifest.build.appId)
    expect(manifest.repository.url).toBe('https://github.com/Fish7w7/Auri.git')
    expect(manifest.build.publish).toContainEqual(expect.objectContaining({ owner: 'Fish7w7', repo: 'Auri' }))
  })
})