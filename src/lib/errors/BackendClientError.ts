import { BffError } from './BffError'

/**
 * Raised by `backendFetch` when the backend returns a 4xx that the caller
 * opted into propagating (`passClientErrors: true`). Used by routes whose
 * 4xx codes carry business meaning the FE must surface verbatim — e.g.
 * `/auth/register` → 409 AUTH_USERNAME_TAKEN, 400 VALIDATION_FAILED,
 * 429 AUTH_RATE_LIMITED.
 *
 * `httpStatus` mirrors the upstream status so `toErrorResponse` returns
 * the same code to the FE client. `upstreamCode` (optional) is the BE
 * error code if the BE body contained one; clients can map it to UI
 * strings (e.g. inline form errors).
 */
export class BackendClientError extends BffError {
  constructor(
    public readonly upstreamStatus: number,
    public readonly upstreamCode: string | null,
    message: string,
    cause?: unknown,
  ) {
    super('BACKEND_CLIENT_ERROR', upstreamStatus, message, cause)
  }
}
