import { BffError } from './BffError'

export class NotFoundError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('NOT_FOUND', 404, message, cause)
  }
}
