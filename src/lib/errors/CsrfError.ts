import { BffError } from './BffError'

export class CsrfError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('CSRF_INVALID', 403, message, cause)
  }
}
