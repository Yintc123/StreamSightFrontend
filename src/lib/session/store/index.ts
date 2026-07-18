import 'server-only'
import { env } from '@/lib/config'
import type { SessionStore } from './types'
import { InMemorySessionStore } from './in-memory'
import { RedisSessionStore } from './redis'

let instance: SessionStore | undefined

/**
 * Pick a session store at first use, decoupled from USE_MOCK:
 *   - REDIS_HOST set → Redis-backed (dev with local Redis, staging, prod)
 *   - REDIS_HOST unset → in-memory (cheap, zero external dep, lost on restart)
 *
 * The store choice is independent of USE_MOCK — that flag only governs the
 * backend *fetch* mock, not where sessions live. This matters in `next dev`:
 * Turbopack compiles Route Handlers and RSC into separate module graphs, each
 * with its own in-memory singleton, so a session written by the login route
 * is invisible to the `/cms` RSC gate → the CMS bounces to login. A shared
 * Redis store fixes it; run `docker compose up -d redis` and set REDIS_HOST.
 *
 * Memoised so the choice is made once per process, not per request.
 */
export function getSessionStore(): SessionStore {
  if (!instance) {
    instance = env.REDIS_HOST
      ? new RedisSessionStore()
      : new InMemorySessionStore()
  }
  return instance
}

export type { SessionStore } from './types'
