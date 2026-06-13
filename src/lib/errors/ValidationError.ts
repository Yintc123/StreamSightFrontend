import { BffError } from './BffError'

export class ValidationError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('VALIDATION_ERROR', 400, message, cause)
  }
}
