import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

const MAX_ENTRIES = 10_000
const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024
const MAX_ENTRY_SIZE = 512 * 1024 * 1024

export async function createZip(sourceRoot: string, entries: readonly string[], destination: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const zip = new yazl.ZipFile()
    const output = createWriteStream(destination, { flags: 'wx' })
    output.on('close', resolvePromise)
    output.on('error', reject)
    zip.outputStream.on('error', reject)
    zip.outputStream.pipe(output)
    for (const entry of entries) zip.addFile(join(sourceRoot, ...entry.split('/')), entry)
    zip.end()
  })
}

export async function extractZip(archive: string, destination: string): Promise<string[]> {
  mkdirSync(destination, { recursive: true })
  const zip = await openZip(archive)
  const entries: string[] = []
  let totalSize = 0

  try {
    await new Promise<void>((resolvePromise, reject) => {
      zip.readEntry()
      zip.on('entry', (entry: yauzl.Entry) => {
        try {
          const name = validateEntryName(entry.fileName)
          entries.push(name)
          if (entries.length > MAX_ENTRIES) throw new Error('O arquivo contém entradas demais.')
          totalSize += entry.uncompressedSize
          if (entry.uncompressedSize > MAX_ENTRY_SIZE || totalSize > MAX_TOTAL_SIZE) {
            throw new Error('O arquivo excede o limite de tamanho seguro.')
          }
          const outputPath = resolve(destination, ...name.split('/'))
          if (!outputPath.startsWith(`${resolve(destination)}${process.platform === 'win32' ? '\\' : '/'}`)) {
            throw new Error('Caminho inseguro no arquivo ZIP.')
          }
          if (name.endsWith('/')) {
            mkdirSync(outputPath, { recursive: true })
            zip.readEntry()
            return
          }
          mkdirSync(dirname(outputPath), { recursive: true })
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) return reject(error ?? new Error('Entrada ZIP inválida.'))
            void pipeline(stream, createWriteStream(outputPath, { flags: 'wx' }))
              .then(() => zip.readEntry())
              .catch(reject)
          })
        } catch (error) {
          reject(error)
        }
      })
      zip.on('end', resolvePromise)
      zip.on('error', reject)
    })
    return entries
  } finally {
    zip.close()
  }
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Arquivo ZIP inválido.'))
      else resolvePromise(zip)
    })
  })
}

function validateEntryName(input: string): string {
  if (!input || input.includes('\\') || input.includes('\0') || /^[a-zA-Z]:/.test(input) || input.startsWith('/')) {
    throw new Error('Caminho inseguro no arquivo ZIP.')
  }
  const normalized = posix.normalize(input)
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('Caminho inseguro no arquivo ZIP.')
  return normalized
}

export function assertRegularFile(path: string): void {
  if (!statSync(path).isFile()) throw new Error('Entrada obrigatória ausente.')
}
