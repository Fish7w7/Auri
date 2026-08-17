import { DomainError } from '@shared/errors/domain-error'

export type CriticalOperation = 'backup' | 'restore' | 'import' | 'migration'

export class CriticalOperationCoordinator {
  private active: CriticalOperation | null = null

  get current(): CriticalOperation | null { return this.active }
  get isBusy(): boolean { return this.active !== null }

  async run<T>(operation: CriticalOperation, task: () => Promise<T> | T): Promise<T> {
    if (this.active) {
      throw new DomainError('BACKUP_OPERATION_IN_PROGRESS', 'Outra operação crítica já está em andamento.', { operation: this.active })
    }
    this.active = operation
    try { return await task() } finally { this.active = null }
  }
}
