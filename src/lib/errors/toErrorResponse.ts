import { BffError } from './BffError'

const NO_STORE_HEADERS: HeadersInit = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
}

export function toErrorResponse(err: unknown, requestId: string): Response {
  if (err instanceof BffError) {
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message, requestId } }),
      { status: err.httpStatus, headers: NO_STORE_HEADERS },
    )
  }
  return new Response(
    JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId },
    }),
    { status: 500, headers: NO_STORE_HEADERS },
  )
}
