import { BffError } from './BffError'

export class ContractViolationError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('CONTRACT_VIOLATION', 502, message, cause)
  }
}
