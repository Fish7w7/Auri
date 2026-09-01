import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetService } from '@main/services/asset-service'
import { validateExternalUrl } from '@main/services/external-url'
import { createDomainFixture, createMinimalWork } from '../fixtures/domain-fixture'

const temporaryDirectories: string[] = []
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('AssetService', () => {
  it('copia capa customizada para asset controlado e independe do arquivo original', () => {
    const fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const root = mkdtempSync(join(tmpdir(), 'auri-cover-test-'))
    temporaryDirectories.push(root)
    const original = join(root, 'original.png')
    writeFileSync(original, Buffer.from([137, 80, 78, 71, 1, 2, 3]))
    const assets = new AssetService(join(root, 'assets'), fixture.services.works)
    const updated = assets.importCustomCover(work.id, original)
    unlinkSync(original)
    expect(updated.cover.customPath).toMatch(/^covers\/custom\/.+\.png$/)
    expect(assets.readCover({ workId: work.id })).toMatch(/^data:image\/png;base64,/)
    expect(existsSync(join(root, 'assets', ...updated.cover.customPath!.split('/')))).toBe(true)
    fixture.db.close()
  })

  it('não remove a capa anterior quando a atualização do banco falha', () => {
    const fixture = createDomainFixture()
    const work = createMinimalWork(fixture)
    const root = mkdtempSync(join(tmpdir(), 'auri-cover-swap-'))
    temporaryDirectories.push(root)
    const first = join(root, 'first.jpg'); const second = join(root, 'second.webp')
    writeFileSync(first, Buffer.from([1, 2, 3])); writeFileSync(second, Buffer.from([4, 5, 6]))
    const assets = new AssetService(join(root, 'assets'), fixture.services.works)
    const current = assets.importCustomCover(work.id, first)
    const oldInternal = join(root, 'assets', ...current.cover.customPath!.split('/'))
    const originalUpdate = fixture.services.works.updateWork.bind(fixture.services.works)
    fixture.services.works.updateWork = (() => { throw new Error('falha simulada') }) as typeof fixture.services.works.updateWork
    expect(() => assets.importCustomCover(work.id, second)).toThrow('falha simulada')
    fixture.services.works.updateWork = originalUpdate
    expect(existsSync(oldInternal)).toBe(true)
    expect(assets.readCover({ workId: work.id })).not.toBeNull()
    fixture.db.close()
  })
})

describe('URL externa segura', () => {
  it.each(['https://scan.example/work', 'http://localhost:8080/work'])('aceita %s', (url) => expect(validateExternalUrl(url).toString()).toBe(url))
  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x'])('rejeita %s', (url) => expect(() => validateExternalUrl(url)).toThrow())
})
