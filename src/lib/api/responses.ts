import 'server-only'

const NO_STORE_HEADERS: HeadersInit = {
  'content-type': 'application/json',
  'cache-control': 'no-store, private',
}

export function okResponse<T>(data: T, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify(meta ? { data, meta } : { data }),
    { status: 200, headers: NO_STORE_HEADERS },
  )
}
