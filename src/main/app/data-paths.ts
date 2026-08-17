import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DataPaths } from '@shared/contracts'

export function resolveDataPaths(userDataPath: string): DataPaths {
  const paths: DataPaths = {
    root: userDataPath,
    database: join(userDataPath, 'data', 'library.sqlite'),
    assets: join(userDataPath, 'assets'),
    coverCache: join(userDataPath, 'cache', 'covers'),
    backups: join(userDataPath, 'backups'),
    logs: join(userDataPath, 'logs'),
    settings: join(userDataPath, 'settings.json')
  }

  for (const directory of [
    join(userDataPath, 'data'),
    paths.assets,
    paths.coverCache,
    paths.backups,
    paths.logs
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  return paths
}
