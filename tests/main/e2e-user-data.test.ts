import { createHash } from 'node:crypto'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertE2EUserData, configureE2EUserData, E2E_USER_DATA_VARIABLE, validateE2EUserDataPath } from '@main/app/e2e-user-data'
import { resolveDataPaths } from '@main/app/data-paths'
import { configureMainProcessEnvironment } from '@main/application/environment'
import { loadOrCreateBridgeIdentity, resolveBridgeEndpoint } from '@main/bridge/bridge-identity'
import { resolveBridgeSecretPath } from '@shared/native-bridge/identity'
import { createMigrations } from '@main/database/migrations'
import { MigrationRunner } from '@main/database/migrations/migration-runner'
import { SettingsService } from '@main/services/settings-service'
import { TestLogger } from '../fixtures/test-logger'

const fixtures: string[] = []
const links: string[] = []
afterEach(() => {
  for (const link of links.splice(0)) if (lstatSync(link, { throwIfNoEntry: false })) unlinkSync(link)
  for (const directory of fixtures.splice(0)) {
    if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('auri-e2e-profile-')) throw new Error('Destino de limpeza fora da fixture.')
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  const project = mkdtempSync(join(tmpdir(), 'auri-e2e-profile-'))
  fixtures.push(project)
  const roaming = join(project, 'synthetic-roaming')
  const root = join(project, 'artifacts', 'e2e-profiles')
  const profile = join(root, 'auritest')
  const paths: Record<string, string> = { appData: roaming, userData: join(roaming, 'Auri-Dev'), temp: join(project, 'temp') }
  const app = {
    isPackaged: false,
    getAppPath: () => project,
    getPath: vi.fn((name: string) => paths[name]),
    setPath: vi.fn((name: string, value: string) => { paths[name] = value }),
    setName: vi.fn(), setAppUserModelId: vi.fn(), disableHardwareAcceleration: vi.fn(),
    commandLine: { appendSwitch: vi.fn() }
  }
  return { project, roaming, root, profile, paths, app }
}

describe('seleção explícita de perfil E2E', () => {
  it('mantém DEV sem override e não cria a raiz E2E', () => {
    const f = fixture()
    const environment = configureMainProcessEnvironment(f.app as never, ['electron.exe'], {})
    expect(f.paths.userData).toBe(join(f.roaming, 'Auri-Dev'))
    expect(environment.e2eUserDataPath).toBeUndefined()
    expect(f.app.setPath.mock.calls).toEqual([['userData', join(f.roaming, 'Auri-Dev')]])
    expect(existsSync(f.root)).toBe(false)
  })

  it('define dados, sessão, logs e crashes antes do bootstrap, sem passar por Auri-Dev', () => {
    const f = fixture()
    const environment = configureMainProcessEnvironment(f.app as never, ['electron.exe'], { [E2E_USER_DATA_VARIABLE]: f.profile })
    expect(environment.e2eUserDataPath).toBe(f.profile)
    expect(f.app.setPath.mock.calls).toEqual([
      ['userData', f.profile], ['sessionData', join(f.profile, 'session')],
      ['logs', join(f.profile, 'logs')], ['crashDumps', join(f.profile, 'crash-dumps')]
    ])
    expect(existsSync(f.roaming)).toBe(false)
    expect(readdirSync(f.project)).toEqual(['artifacts'])
    expect(assertE2EUserData(f.app as never, f.profile)).toBe(f.profile)
  })

  it.each(['', ' ', 'relative-profile'])('rejeita override inválido %j sem fallback ou criação', (value) => {
    const f = fixture()
    expect(() => configureMainProcessEnvironment(f.app as never, ['electron.exe'], { [E2E_USER_DATA_VARIABLE]: value })).toThrow(E2E_USER_DATA_VARIABLE)
    expect(f.app.setPath).not.toHaveBeenCalled()
    expect(readdirSync(f.project)).toEqual([])
  })

  it('bloqueia raiz, prefixo semelhante, .. e os destinos PROD/DEV sintéticos', () => {
    const f = fixture()
    for (const value of [
      f.root, join(f.project, 'artifacts', 'e2e-profiles-other', 'test'),
      `${f.root}${sep}..${sep}escape`,
      join(f.roaming, 'Auri'), join(f.roaming, 'Auri-Dev')
    ]) expect(() => configureE2EUserData(f.app as never, value)).toThrow(E2E_USER_DATA_VARIABLE)
    expect(f.app.setPath).not.toHaveBeenCalled()
    expect(readdirSync(f.project)).toEqual([])
  })

  it('rejeita produção e não altera seu perfil, mesmo com override válido', () => {
    const f = fixture()
    f.app.isPackaged = true
    f.paths.userData = join(f.roaming, 'Auri')
    expect(() => configureMainProcessEnvironment(f.app as never, ['Auri.exe'], { [E2E_USER_DATA_VARIABLE]: f.profile })).toThrow(E2E_USER_DATA_VARIABLE)
    expect(f.paths.userData).toBe(join(f.roaming, 'Auri'))
    expect(f.app.getPath).not.toHaveBeenCalled()
    expect(f.app.setPath).not.toHaveBeenCalled()
    expect(existsSync(f.root)).toBe(false)
  })

  it('não combina perfil E2E com smoke que pode limpar dados', () => {
    const f = fixture()
    expect(() => configureMainProcessEnvironment(f.app as never, ['electron.exe', '--smoke-test'], { [E2E_USER_DATA_VARIABLE]: f.profile })).toThrow(E2E_USER_DATA_VARIABLE)
    expect(f.app.setPath).not.toHaveBeenCalled()
    expect(readdirSync(f.project)).toEqual([])
  })

  it('revalida o userData efetivo sem aceitar troca para o DEV padrão', () => {
    const f = fixture()
    configureE2EUserData(f.app as never, f.profile)
    f.paths.userData = join(f.roaming, 'Auri-Dev')
    expect(() => assertE2EUserData(f.app as never, f.profile)).toThrow('userData efetivo diverge')
    expect(existsSync(f.roaming)).toBe(false)
  })
})

describe('limites de filesystem do perfil', () => {
  function junction(target: string, destination: string) {
    mkdirSync(dirname(destination), { recursive: true })
    symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
    links.push(destination)
  }

  it('bloqueia junction/symlink na raiz dedicada e não segue seu destino', () => {
    const f = fixture()
    const target = join(f.project, 'outside')
    mkdirSync(target)
    junction(target, f.root)
    expect(() => configureE2EUserData(f.app as never, f.profile)).toThrow('symlink')
    expect(readdirSync(target)).toEqual([])
    expect(f.app.setPath).not.toHaveBeenCalled()
  })

  it('bloqueia junction/symlink em um ancestral do perfil', () => {
    const f = fixture()
    const target = join(f.project, 'outside')
    mkdirSync(target)
    junction(target, join(f.root, 'redirect'))
    expect(() => configureE2EUserData(f.app as never, join(f.root, 'redirect', 'test'))).toThrow('symlink')
    expect(readdirSync(target)).toEqual([])
  })

  it('bloqueia junction dentro de perfil reutilizado antes de criar dados', () => {
    const f = fixture()
    const target = join(f.project, 'outside')
    mkdirSync(target)
    junction(target, join(f.profile, 'data'))
    expect(() => configureE2EUserData(f.app as never, f.profile)).toThrow('symlink')
    expect(readdirSync(target)).toEqual([])
    expect(f.app.setPath).not.toHaveBeenCalled()
  })

  it('bloqueia arquivo de banco compartilhado por hard link', () => {
    const f = fixture()
    const source = join(f.project, 'outside.sqlite')
    writeFileSync(source, 'synthetic-sentinel')
    mkdirSync(join(f.profile, 'data'), { recursive: true })
    linkSync(source, join(f.profile, 'data', 'library.sqlite'))
    expect(() => configureE2EUserData(f.app as never, f.profile)).toThrow('hard link')
    expect(readFileSync(source, 'utf8')).toBe('synthetic-sentinel')
  })

  it('bloqueia backup externo salvo em settings E2E', () => {
    const f = fixture()
    mkdirSync(f.profile, { recursive: true })
    writeFileSync(join(f.profile, 'settings.json'), JSON.stringify({ backupDirectory: join(f.roaming, 'Auri', 'backups') }))
    expect(() => configureE2EUserData(f.app as never, f.profile)).toThrow('backup')
    expect(existsSync(f.roaming)).toBe(false)
  })

  it('não aceita arquivo no lugar de diretório', () => {
    const f = fixture()
    mkdirSync(f.root, { recursive: true })
    writeFileSync(f.profile, 'synthetic')
    expect(() => validateE2EUserDataPath(f.project, f.profile)).toThrow('arquivo')
  })
})

describe('dados e identidade independentes', () => {
  it('migra somente a fixture isolada e mantém bancos PROD/DEV sintéticos intactos', () => {
    const f = fixture()
    const existing = ['Auri', 'Auri-Dev'].map((name) => {
      const file = join(f.roaming, name, 'data', 'library.sqlite')
      mkdirSync(dirname(file), { recursive: true })
      const db = new Database(file)
      db.exec('CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES (\'synthetic\');')
      db.close()
      return { file, hash: createHash('sha256').update(readFileSync(file)).digest('hex') }
    })
    configureE2EUserData(f.app as never, f.profile)
    const paths = resolveDataPaths(assertE2EUserData(f.app as never, f.profile)!)
    const db = new Database(paths.database)
    try {
      expect(new MigrationRunner(db, new TestLogger(), createMigrations(db)).run()).toBe(3)
      expect(db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 3 })
      new SettingsService(paths.settings, new TestLogger()).updateSettings({ closeToTray: false })
      for (const value of Object.values(paths)) expect(value === f.profile || value.startsWith(f.profile + sep)).toBe(true)
      for (const directory of [paths.assets, paths.coverCache, paths.backups, paths.logs]) expect(existsSync(directory)).toBe(true)
    } finally { db.close() }
    for (const entry of existing) expect(createHash('sha256').update(readFileSync(entry.file)).digest('hex')).toBe(entry.hash)
    const identity = loadOrCreateBridgeIdentity(f.profile, false)
    expect(identity.endpoint).not.toBe(resolveBridgeEndpoint(join(f.roaming, 'Auri-Dev'), false))
    expect(identity.secretPath).toBe(resolveBridgeSecretPath(f.profile))
    expect(identity.secretPath.startsWith(f.profile + sep)).toBe(true)
    expect(identity.secret).toEqual(loadOrCreateBridgeIdentity(f.profile, false).secret)
    const other = join(f.root, 'another-synthetic-profile')
    configureE2EUserData(f.app as never, other)
    const otherIdentity = loadOrCreateBridgeIdentity(other, false)
    expect(otherIdentity.endpoint).not.toBe(identity.endpoint)
    expect(otherIdentity.secret.equals(identity.secret)).toBe(false)
  })
})
