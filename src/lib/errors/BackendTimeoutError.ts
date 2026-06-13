import { BffError } from './BffError'

export class BackendTimeoutError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('BACKEND_TIMEOUT', 504, message, cause)
  }
}
