import { constants, copyFileSync, linkSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

function fail(message) { throw new Error('AURI_NATIVE_HOST_OUTPUT: ' + message) }

/** Reparse points beyond Node symlinks are inspected on Windows too; unavailable inspection fails closed. */
export function assertPrivateBuildDirectory(directory) {
  if (!isAbsolute(directory)) fail('diretório absoluto obrigatório')
  const absolute = resolve(directory), paths = []
  let current = parse(absolute).root
  for (const segment of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, segment)
    const entry = lstatSync(current, { throwIfNoEntry: false })
    if (!entry) break
    if (entry.isSymbolicLink() || !entry.isDirectory()) fail('link ou tipo inesperado no diretório')
    if (relative(current, realpathSync.native(current)) !== '') fail('diretório não canônico')
    paths.push(current)
  }
  assertNoWindowsReparsePoints(paths)
}

function assertNoWindowsReparsePoints(paths) {
  if (process.platform !== 'win32' || paths.length === 0) return
  const shell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = '$ErrorActionPreference="Stop"; foreach($p in (ConvertFrom-Json $env:AURI_BUILD_INSPECTION_PATHS)){ $i=Get-Item -LiteralPath $p -Force; if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){ throw "Reparse point rejected" } }'
  const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    windowsHide: true, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, AURI_BUILD_INSPECTION_PATHS: JSON.stringify(paths) }
  })
  if (result.error || result.status !== 0) fail('inspeção Windows de reparse points indisponível ou recusada')
}

export function inspectNativeHostOutput(directory, name) {
  if (basename(name) !== name || !/^AuriNativeHost(?:Dev|E2E)?\.exe$/u.test(name)) fail('nome de executável não autorizado')
  assertPrivateBuildDirectory(directory)
  const file = join(directory, name), stat = lstatSync(file, { throwIfNoEntry: false, bigint: true })
  if (!stat) return { file, exists: false }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n) fail('destino suspeito, compartilhado ou de tipo inesperado; preservado')
  assertNoWindowsReparsePoints([file])
  if (relative(file, realpathSync.native(file)) !== '') fail('destino não canônico')
  return { file, exists: true }
}

function privatePreparedFile(file) {
  assertPrivateBuildDirectory(dirname(file))
  const stat = lstatSync(file, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail('temporário deixou de ser privado')
  assertNoWindowsReparsePoints([file])
  return stat
}

/**
 * No portable compare-and-swap replacement exists here. Existing regular files are
 * inspected but never replaced: preserve them and choose a fresh candidates directory.
 * linkSync publishes a fully prepared inode atomically with NO overwrite, including
 * a concurrent regular file/symlink/hard link created after the final preflight.
 */
export async function prepareAndPublishNativeHost({ directory, name, sourceExecutable, prepare, validate }) {
  const target = inspectNativeHostOutput(directory, name)
  if (target.exists) fail('arquivo regular anterior preservado; substituição segura não disponível. Use um novo --output-directory sob artifacts/native-host/candidates')
  mkdirSync(directory, { recursive: true })
  assertPrivateBuildDirectory(directory)
  const temporaryDirectory = mkdtempSync(join(directory, '.auri-native-host-'))
  assertPrivateBuildDirectory(temporaryDirectory)
  const temporaryExecutable = join(temporaryDirectory, name)
  // A failed preparation is kept for inspection. Never recursively delete a suspicious tree.
  copyFileSync(sourceExecutable, temporaryExecutable, constants.COPYFILE_EXCL)
  privatePreparedFile(temporaryExecutable)
  await prepare(temporaryExecutable)
  privatePreparedFile(temporaryExecutable)
  await validate(temporaryExecutable)
  const prepared = privatePreparedFile(temporaryExecutable)
  const current = inspectNativeHostOutput(directory, name)
  if (current.exists) fail('destino criado durante a preparação; preservado sem publicação')
  linkSync(temporaryExecutable, target.file)
  // No code writes to the prepared inode after publication. Remove only our own alias.
  const published = lstatSync(target.file, { bigint: true }), staged = lstatSync(temporaryExecutable, { bigint: true })
  if (published.dev !== prepared.dev || published.ino !== prepared.ino || staged.ino !== prepared.ino || published.nlink !== 2n || staged.nlink !== 2n) {
    fail('publicação ocorreu, mas a propriedade mudou; preservar ambos os caminhos e revisar')
  }
  try { unlinkSync(temporaryExecutable); rmdirSync(temporaryDirectory) }
  catch { return { executablePath: target.file, cleanupPending: temporaryDirectory } }
  return { executablePath: target.file }
}