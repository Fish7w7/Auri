import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const publication = vi.hoisted(() => ({ fail: false, beforeLink: undefined as undefined | (() => void) }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, linkSync: ((...args: Parameters<typeof fs.linkSync>) => {
    const beforeLink = publication.beforeLink; publication.beforeLink = undefined; beforeLink?.()
    if (publication.fail) throw Object.assign(new Error('synthetic publication failure'), { code: 'EACCES' })
    return fs.linkSync(...args)
  }) as typeof fs.linkSync }
})
import { assertPrivateBuildDirectory, inspectNativeHostOutput, prepareAndPublishNativeHost } from '../../scripts/build/native-host-output.mjs'

vi.setConfig({ testTimeout: 30000 })
beforeEach(() => { publication.fail = false; publication.beforeLink = undefined })
function fixture() {
  const parent = resolve('artifacts/native-host-output-fixtures'); mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'case-')), directory = join(root, 'output'), source = join(root, 'synthetic-source.bin')
  mkdirSync(directory); writeFileSync(source, 'SYNTHETIC NODE INPUT', { flag: 'wx' })
  return { root, directory, source, destination: join(directory, 'AuriNativeHostE2E.exe') }
}
const name = 'AuriNativeHostE2E.exe'
function options(f: ReturnType<typeof fixture>) { return { directory: f.directory, name, sourceExecutable: f.source, prepare: vi.fn((file: string) => { writeFileSync(file, 'SYNTHETIC PREPARED') }), validate: vi.fn() } }

describe('publicação Native Host exclusivamente sintética e sem overwrite', () => {
  it('destino inexistente publica somente após preparar/validar um temporário exclusivo', async () => {
    const f = fixture(), call = options(f), order: string[] = []
    call.prepare.mockImplementation(file => { expect(file).not.toBe(f.destination); expect(file.startsWith(f.directory + '\\') || file.startsWith(f.directory + '/')).toBe(true); expect(lstatSync(file).nlink).toBe(1); order.push('postject'); writeFileSync(file, 'PREPARED') })
    call.validate.mockImplementation((file: string) => { expect(readFileSync(file, 'utf8')).toBe('PREPARED'); expect(existsSync(f.destination)).toBe(false); order.push('validate') })
    const result = await prepareAndPublishNativeHost(call)
    expect(result.executablePath).toBe(f.destination); expect(order).toEqual(['postject', 'validate']); expect(readFileSync(f.destination, 'utf8')).toBe('PREPARED'); expect(lstatSync(f.destination).nlink).toBe(1)
  })
  it('arquivo regular é válido na inspeção; substituir sem compare-and-swap falha fechado preservando-o', async () => {
    const f = fixture(); writeFileSync(f.destination, 'PREVIOUS'); expect(inspectNativeHostOutput(f.directory, name).exists).toBe(true)
    const call = options(f); await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('arquivo regular anterior preservado')
    expect(readFileSync(f.destination, 'utf8')).toBe('PREVIOUS'); expect(call.prepare).not.toHaveBeenCalled()
  })
  it('hard link no destino nunca modifica o outro nome, nem chama postject', async () => {
    const f = fixture(), other = join(f.root, 'other.bin'); writeFileSync(other, 'PRESERVE'); linkSync(other, f.destination)
    const call = options(f); await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('compartilhado')
    expect(readFileSync(other, 'utf8')).toBe('PRESERVE'); expect(readFileSync(f.destination, 'utf8')).toBe('PRESERVE'); expect(call.prepare).not.toHaveBeenCalled()
  })
  it('link/junction e tipos inesperados de destino são rejeitados sem remoção', async () => {
    const f = fixture(), target = join(f.root, 'separate'); mkdirSync(target); symlinkSync(target, f.destination, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(prepareAndPublishNativeHost(options(f))).rejects.toThrow('suspeito'); expect(lstatSync(f.destination).isSymbolicLink()).toBe(true)
    const second = fixture(); mkdirSync(second.destination); await expect(prepareAndPublishNativeHost(options(second))).rejects.toThrow('tipo inesperado'); expect(lstatSync(second.destination).isDirectory()).toBe(true)
  })
  it('falha de preparação não publica e preserva um arquivo anterior surgido durante o trabalho', async () => {
    const f = fixture(), call = options(f); call.prepare.mockImplementation(() => { writeFileSync(f.destination, 'CONCURRENT PREVIOUS'); throw new Error('prepare failed') })
    await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('prepare failed'); expect(readFileSync(f.destination, 'utf8')).toBe('CONCURRENT PREVIOUS'); expect(call.validate).not.toHaveBeenCalled()
  })
  it('falha de validação não publica o temporário', async () => {
    const f = fixture(), call = options(f); call.validate.mockImplementation(() => { throw new Error('validation failed') })
    await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('validation failed'); expect(existsSync(f.destination)).toBe(false)
  })
  it('falha de publicação mantém outro arquivo anterior intacto', async () => {
    const f = fixture(), call = options(f); writeFileSync(join(f.root, 'previous.bin'), 'PREVIOUS'); publication.fail = true
    await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('synthetic publication failure'); expect(existsSync(f.destination)).toBe(false); expect(readFileSync(join(f.root, 'previous.bin'), 'utf8')).toBe('PREVIOUS')
  })
  it('colisão depois do último preflight não sobrescreve o concorrente', async () => {
    const f = fixture(), call = options(f); publication.beforeLink = () => writeFileSync(f.destination, 'CONCURRENT', { flag: 'wx' })
    await expect(prepareAndPublishNativeHost(call)).rejects.toThrow(); expect(readFileSync(f.destination, 'utf8')).toBe('CONCURRENT')
  })
  it('hard link inserido entre preflight e publicação não altera o alvo externo à saída', async () => {
    const f = fixture(), other = join(f.root, 'sentinel.bin'); writeFileSync(other, 'PRESERVE'); publication.beforeLink = () => linkSync(other, f.destination)
    await expect(prepareAndPublishNativeHost(options(f))).rejects.toThrow(); expect(readFileSync(other, 'utf8')).toBe('PRESERVE')
  })
  it('temporário tornado compartilhado após preparação é rejeitado antes da publicação', async () => {
    const f = fixture(), call = options(f); call.prepare.mockImplementation(file => { linkSync(file, join(f.root, 'shared-preparation.bin')) })
    await expect(prepareAndPublishNativeHost(call)).rejects.toThrow('temporário'); expect(existsSync(f.destination)).toBe(false)
  })
  it('rejeita escapes no nome e junction em ancestral antes de qualquer cópia', async () => {
    const f = fixture(); expect(() => inspectNativeHostOutput(f.directory, '../AuriNativeHost.exe')).toThrow('nome')
    const separate = join(f.root, 'separate'); renameSync(f.directory, separate); symlinkSync(separate, f.directory, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => assertPrivateBuildDirectory(f.directory)).toThrow(); await expect(prepareAndPublishNativeHost(options(f))).rejects.toThrow(); expect(existsSync(f.destination)).toBe(false)
  })
})