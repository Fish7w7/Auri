export const DOMAIN_ERROR_CODES = [
  'WORK_NOT_FOUND',
  'WORK_IN_TRASH',
  'SOURCE_NOT_FOUND',
  'INVALID_CHAPTER',
  'CHAPTER_NOT_NUMERIC',
  'DUPLICATE_EXTERNAL_REF',
  'DUPLICATE_ALIAS',
  'DUPLICATE_SOURCE',
  'INVALID_STATUS',
  'INVALID_MEDIA_TYPE',
  'INVALID_INPUT',
  'HISTORY_NOT_FOUND',
  'HISTORY_CANNOT_UNDO',
  'CONFIRMATION_REQUIRED',
  'CONSTRAINT_VIOLATION',
  'INTERNAL_ERROR',
  'METADATA_PROVIDER_UNAVAILABLE',
  'METADATA_RATE_LIMITED',
  'METADATA_NOT_FOUND',
  'METADATA_INVALID_RESPONSE',
  'METADATA_DUPLICATE_ACTIVE',
  'METADATA_DUPLICATE_TRASH',
  'METADATA_PROBABLE_DUPLICATE',
  'URL_INVALID',
  'URL_PROTOCOL_NOT_ALLOWED',
  'URL_DESTINATION_BLOCKED',
  'URL_REDIRECT_BLOCKED',
  'URL_TOO_MANY_REDIRECTS',
  'URL_FETCH_TIMEOUT',
  'URL_RESPONSE_TOO_LARGE',
  'URL_UNSUPPORTED_CONTENT',
  'URL_FETCH_FAILED',
  'COVER_DOWNLOAD_FAILED',
  'COVER_TOO_LARGE',
  'COVER_INVALID_IMAGE',
  'COVER_TIMEOUT',
  'BACKUP_INVALID',
  'BACKUP_TOO_NEW',
  'BACKUP_DIRECTORY_UNAVAILABLE',
  'BACKUP_OPERATION_IN_PROGRESS',
  'BACKUP_CREATE_FAILED',
  'BACKUP_RESTORE_FAILED',
  'EXPORT_FAILED',
  'IMPORT_INVALID',
  'IMPORT_UNSUPPORTED_VERSION',
  'IMPORT_CONFLICT',
  'IMPORT_FAILED',
  'UPDATE_CHECK_FAILED',
  'UPDATE_DOWNLOAD_FAILED',
  'UPDATE_INSTALL_BLOCKED',
  'DATABASE_SCHEMA_TOO_NEW',
  'DATABASE_INTEGRITY_FAILED',
  'DIAGNOSTIC_EXPORT_FAILED',
  'SYSTEM_FOLDER_UNAVAILABLE',
  'MIGRATION_BACKUP_FAILED',
  'MIGRATION_FAILED'
] as const

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number]

export interface DomainErrorShape {
  code: DomainErrorCode
  message: string
  details?: Record<string, string | number | boolean | null>
}

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: DomainErrorShape['details']
  ) {
    super(message)
    this.name = 'DomainError'
  }

  toJSON(): DomainErrorShape {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) }
  }
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: DomainErrorShape }
