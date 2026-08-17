import type { DataPaths, SystemStatus } from '@shared/contracts'
import { systemStatusSchema } from '@shared/contracts'
import { SystemRepository } from '../database/repositories/system-repository'

export class SystemService {
  constructor(
    private readonly repository: SystemRepository,
    private readonly appVersion: string,
    private readonly paths: DataPaths
  ) {}

  getStatus(): SystemStatus {
    this.repository.assertHealthy()

    return systemStatusSchema.parse({
      appVersion: this.appVersion,
      database: {
        state: 'ready',
        schemaVersion: this.repository.getSchemaVersion(),
        sqliteVersion: this.repository.getSqliteVersion()
      },
      paths: this.paths
    })
  }
}

