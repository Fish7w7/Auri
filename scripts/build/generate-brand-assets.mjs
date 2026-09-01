import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const source = join(root, 'src', 'renderer', 'public', 'auri-icon.svg')
const buildDirectory = join(root, 'build', 'assets')
const publicPng = join(root, 'src', 'renderer', 'public', 'auri-icon.png')
const buildPng = join(buildDirectory, 'auri-icon.png')
const icoPath = join(buildDirectory, 'icon.ico')
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

await mkdir(buildDirectory, { recursive: true })

const pngEntries = await Promise.all(icoSizes.map(async (size) => ({
  size,
  data: await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
})))

const applicationPng = await sharp(source, { density: 384 })
  .resize(512, 512, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer()

await Promise.all([
  writeFile(publicPng, applicationPng),
  writeFile(buildPng, applicationPng),
  writeFile(icoPath, createIco(pngEntries))
])

function createIco(entries) {
  const headerSize = 6
  const directoryEntrySize = 16
  const directorySize = entries.length * directoryEntrySize
  const header = Buffer.alloc(headerSize + directorySize)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = header.length
  entries.forEach(({ size, data }, index) => {
    const entryOffset = headerSize + index * directoryEntrySize
    header.writeUInt8(size === 256 ? 0 : size, entryOffset)
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    header.writeUInt8(0, entryOffset + 2)
    header.writeUInt8(0, entryOffset + 3)
    header.writeUInt16LE(1, entryOffset + 4)
    header.writeUInt16LE(32, entryOffset + 6)
    header.writeUInt32LE(data.length, entryOffset + 8)
    header.writeUInt32LE(offset, entryOffset + 12)
    offset += data.length
  })

  return Buffer.concat([header, ...entries.map(({ data }) => data)])
}
