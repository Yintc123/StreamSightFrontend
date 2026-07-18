import 'server-only'
import { env } from '@/lib/config'
import type { SessionStore } from './types'
import { InMemorySessionStore } from './in-memory'
import { RedisSessionStore } from './redis'

/**
 * Pick a session store at first use:
 *   - USE_MOCK=1 or REDIS_HOST unset → in-memory (dev / e2e / CI — cheap,
 *     zero external dep, lost on restart)
 *   - otherwise (USE_MOCK=0 with REDIS_HOST) → Redis-backed (staging / prod)
 *
 * USE_MOCK stays the single "fully self-contained" switch: =1 needs no Redis
 * and no real backend.
 *
 * Memoised on `globalThis`, NOT a module-local variable. `next dev`
 * (Turbopack) compiles Route Handlers and RSC into separate module graphs, so
 * a module-local singleton gives each graph its own empty in-memory Map — a
 * session written by the login route would be invisible to the `/cms` RSC gate
 * and the CMS would bounce to login. Route handlers + RSC share one process
 * (hence one `globalThis`), so stashing the instance there makes the in-memory
 * store shared across graphs (verified in dev). It also prevents duplicate
 * Redis clients across HMR reloads.
 */
const g = globalThis as unknown as { __sessionStore?: SessionStore }

export function getSessionStore(): SessionStore {
  if (!g.__sessionStore) {
    g.__sessionStore =
      env.USE_MOCK === '1' || !env.REDIS_HOST
        ? new InMemorySessionStore()
        : new RedisSessionStore()
  }
  return g.__sessionStore
}

export type { SessionStore } from './types'
