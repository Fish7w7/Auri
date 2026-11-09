import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import type { App } from 'electron'

export const E2E_USER_DATA_VARIABLE = 'AURI_E2E_USER_DATA'
type ProfileApp = Pick<App, 'isPackaged' | 'getAppPath' | 'getPath' | 'setPath'>

function invalid(reason: string): never {
  throw new Error(`${E2E_USER_DATA_VARIABLE}: ${reason}`)
}

function isInside(root: string, target: string): boolean {
  const suffix = relative(root, target)
  return suffix !== '' && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix)
}

function assertDirectoryChain(value: string): void {
  const absolute = resolve(value)
  let current = parse(absolute).root
  for (const segment of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, segment)
    const entry = lstatSync(current, { throwIfNoEntry: false })
    if (!entry) return
    if (entry.isSymbolicLink() || !entry.isDirectory()) invalid('symlink, junction ou arquivo no caminho do perfil.')
  }
}

function canonicalPath(value: string): string {
  let ancestor = resolve(value)
  const missing: string[] = []
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    missing.unshift(parse(ancestor).base)
    const parent = dirname(ancestor)
    if (parent === ancestor) invalid('não foi possível resolver o caminho canônico.')
    ancestor = parent
  }
  return resolve(realpathSync.native(ancestor), ...missing)
}

function assertPrivateTree(directory: string): void {
  if (!lstatSync(directory, { throwIfNoEntry: false })) return
  for (const name of readdirSync(directory)) {
    const entryPath = join(directory, name)
    // Chromium can rename its temporary cache files between readdir and lstat.
    const entry = lstatSync(entryPath, { throwIfNoEntry: false })
    if (!entry) continue
    if (entry.isSymbolicLink()) invalid('o perfil contém symlink ou junction.')
    if (entry.isDirectory()) assertPrivateTree(entryPath)
    else if (!entry.isFile() || entry.nlink > 1) invalid('o perfil contém arquivo especial ou compartilhado por hard link.')
  }
}

function assertPrivateBackupDirectory(profile: string): void {
  const settingsPath = join(profile, 'settings.json')
  if (!lstatSync(settingsPath, { throwIfNoEntry: false })) return
  let settings: { backupDirectory?: unknown }
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { backupDirectory?: unknown }
  } catch {
    invalid('settings.json inválido no perfil E2E.')
  }
  const directory = settings?.backupDirectory
  if (directory === undefined || directory === null) return
  if (typeof directory !== 'string' || !isAbsolute(directory)) invalid('o backup precisa permanecer dentro do perfil E2E.')
  assertDirectoryChain(directory)
  const allowed = canonicalPath(join(profile, 'backups'))
  const target = canonicalPath(directory)
  if (relative(allowed, target) !== '' && !isInside(allowed, target)) invalid('o backup precisa permanecer dentro de backups do perfil E2E.')
}

/** Validates existing ancestors and profile contents without creating directories. */
export function validateE2EUserDataPath(projectRoot: string, requested: string): string {
  if (!isAbsolute(projectRoot) || !requested || requested !== requested.trim() || !isAbsolute(requested)) {
    invalid('informe um diretório absoluto sob artifacts/e2e-profiles.')
  }
  if (requested.includes('\0') || requested.split(/[\\/]/u).includes('..')) invalid('segmentos de escape não são permitidos.')
  const root = resolve(projectRoot, 'artifacts', 'e2e-profiles')
  const target = resolve(requested)
  if (!isInside(root, target)) invalid('o destino precisa ser um perfil dentro de artifacts/e2e-profiles.')
  assertDirectoryChain(projectRoot)
  assertDirectoryChain(root)
  assertDirectoryChain(target)
  const canonicalRoot = canonicalPath(root)
  const canonicalTarget = canonicalPath(target)
  if (!isInside(canonicalRoot, canonicalTarget)) invalid('o caminho canônico escapa da raiz E2E.')
  assertPrivateTree(canonicalTarget)
  assertPrivateBackupDirectory(canonicalTarget)
  return canonicalTarget
}

function createPrivateDirectory(value: string): void {
  const absolute = resolve(value)
  let current = parse(absolute).root
  for (const segment of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, segment)
    if (!lstatSync(current, { throwIfNoEntry: false })) mkdirSync(current)
    const entry = lstatSync(current)
    if (entry.isSymbolicLink() || !entry.isDirectory()) invalid('o destino mudou durante a preparação.')
  }
}

/** This opt-in never applies to a packaged installation. */
export function configureE2EUserData(app: ProfileApp, requested: string | undefined): string | undefined {
  if (requested === undefined) return undefined
  if (app.isPackaged) invalid('o override é permitido somente no Desktop de desenvolvimento.')
  const selected = validateE2EUserDataPath(app.getAppPath(), requested)
  const directories = {
    userData: selected,
    sessionData: join(selected, 'session'),
    logs: join(selected, 'logs'),
    crashDumps: join(selected, 'crash-dumps')
  }
  for (const directory of Object.values(directories)) createPrivateDirectory(directory)
  if (validateE2EUserDataPath(app.getAppPath(), selected) !== selected) invalid('o destino canônico mudou.')
  for (const [name, directory] of Object.entries(directories)) app.setPath(name, directory)
  assertE2EUserData(app, selected)
  return selected
}

/** Rechecked before any application services, database or recovery can be opened. */
export function assertE2EUserData(app: ProfileApp, requested = process.env[E2E_USER_DATA_VARIABLE]): string | undefined {
  if (requested === undefined) return undefined
  if (app.isPackaged) invalid('o override é permitido somente no Desktop de desenvolvimento.')
  const expected = validateE2EUserDataPath(app.getAppPath(), requested)
  if (relative(expected, resolve(app.getPath('userData'))) !== '') invalid('userData efetivo diverge do perfil validado; inicialização interrompida.')
  return expected
}
