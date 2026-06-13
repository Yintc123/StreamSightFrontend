import { BffError } from './BffError'

export class BackendUpstreamError extends BffError {
  constructor(message: string, cause?: unknown) {
    super('BACKEND_UPSTREAM_ERROR', 502, message, cause)
  }
}
