import { BffError } from './BffError'

export class UnauthenticatedError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('UNAUTHENTICATED', 401, message, cause)
  }
}
