import 'server-only'
import { env } from '@/lib/config'
import type { SessionStore } from './types'
import { InMemorySessionStore } from './in-memory'
import { RedisSessionStore } from './redis'

let instance: SessionStore | undefined

/**
 * Pick a session store at first use:
 *   - USE_MOCK=1 or REDIS_HOST unset → in-memory (dev / e2e — lost on
 *     restart, but cheap and zero external dep)
 *   - otherwise → Redis-backed (staging / production)
 *
 * Memoised so the choice is made once per process, not per request.
 */
export function getSessionStore(): SessionStore {
  if (!instance) {
    instance =
      env.USE_MOCK === '1' || !env.REDIS_HOST
        ? new InMemorySessionStore()
        : new RedisSessionStore()
  }
  return instance
}

export type { SessionStore } from './types'
