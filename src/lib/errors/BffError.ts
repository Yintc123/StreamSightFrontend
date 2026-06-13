export type BffErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'BACKEND_TIMEOUT'
  | 'BACKEND_UPSTREAM_ERROR'
  | 'CONTRACT_VIOLATION'
  | 'INTERNAL_ERROR'

export class BffError extends Error {
  constructor(
    public readonly code: BffErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}
