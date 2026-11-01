export const ERROR_CODES = [
  'NOT_CONFIGURED',
  'WORKSPACE_NOT_REGISTERED',
  'SCOPE_FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'INVALID_STATE',
  'INVALID_INPUT',
  'APPROVAL_UNAVAILABLE',
  'APPROVAL_REJECTED',
  'READ_ONLY',
  'STORAGE_ERROR',
  'NO_TASK',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export class MemoryError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'MemoryError'
    this.code = code
  }
}

export function memoryError(code: ErrorCode, message: string): never {
  throw new MemoryError(code, message)
}

export function isMemoryError(error: unknown): error is MemoryError {
  return error instanceof MemoryError
}
