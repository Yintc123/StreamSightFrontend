import { BffError } from './BffError'

export class PayloadTooLargeError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('PAYLOAD_TOO_LARGE', 413, message, cause)
  }
}
