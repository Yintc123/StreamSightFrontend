import { BffError } from './BffError'

const NO_STORE_HEADERS: HeadersInit = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
}

export function toErrorResponse(
  err: unknown,
  requestId: string,
  // Spec 001h §5.2 — optional trace id for the envelope (non-PII; lets a user
  // paste it for support lookup). Passed in by the server-only caller so this
  // module stays free of a server-only trace import (the errors barrel is
  // reachable from client code).
  traceId?: string | null,
): Response {
  const trace = traceId ? { traceId } : {}
  if (err instanceof BffError) {
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message, requestId, ...trace } }),
      { status: err.httpStatus, headers: NO_STORE_HEADERS },
    )
  }
  return new Response(
    JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId, ...trace },
    }),
    { status: 500, headers: NO_STORE_HEADERS },
  )
}
