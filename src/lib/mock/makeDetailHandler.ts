// Spec 002 §4 — Generic detail handler factory.
//
// Looks up a fixture by `id` (path-suffix of the upstream URL); when
// found, returns the adapted backend-shape JSON. Miss → throws a
// `BackendUpstreamError` with a synthetic status — the dispatcher
// surfaces it as a 404 via `backendFetch`'s status handling.
//
// The `id` comes from the URL the dispatcher receives (the helper
// returned by `makeDetailHandler` is registered against the path
// PREFIX; the dispatcher rewrites lookups so per-id paths route here).

import 'server-only'

import { NotFoundError } from '@/lib/errors/NotFoundError'
import type { MockHandler } from './dispatch'

export interface DetailContext {
  id: string
}

export function makeDetailHandler<TFixture>(
  find: (id: string) => TFixture | undefined,
  adapter: (f: TFixture) => unknown,
  resource: string,
): MockHandler {
  return ({ query }) => {
    const id = typeof query?.__id === 'string' ? query.__id : ''
    const fixture = find(id)
    if (!fixture) {
      throw new NotFoundError(`Mock ${resource} not found for id ${id}`)
    }
    return adapter(fixture)
  }
}
