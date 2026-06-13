import 'server-only'
import { randomBytes } from 'node:crypto'
import Redis from 'ioredis'
import { env } from '@/lib/config'
import { BackendUpstreamError } from '@/lib/errors'
import type { SessionStore } from './types'
import type { StoredSession, TokenPair } from '../types'

const TOUCH_LUA = `if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('PEXPIRE', KEYS[1], ARGV[1]) else return 0 end`
const RELEASE_LOCK_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`

export type RedisSessionStoreOptions = {
  url?: string
  keyPrefix?: string
  tls?: boolean
  connectTimeout?: number
  commandTimeout?: number
}

export class RedisSessionStore implements SessionStore {
  private readonly redis: Redis
  private readonly keyPrefix: string

  constructor(opts: RedisSessionStoreOptions = {}) {
    const url = opts.url ?? env.REDIS_URL
    if (!url) {
      throw new Error('RedisSessionStore: REDIS_URL is required')
    }
    this.keyPrefix = opts.keyPrefix ?? env.REDIS_KEY_PREFIX
    const useTls = opts.tls ?? (env.REDIS_TLS_ENABLED === '1' || url.startsWith('rediss://'))
    this.redis = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: opts.connectTimeout ?? env.REDIS_CONNECT_TIMEOUT_MS,
      commandTimeout: opts.commandTimeout ?? env.REDIS_COMMAND_TIMEOUT_MS,
      ...(useTls ? { tls: {} } : {}),
    })

    this.redis.on('error', () => {
      // ioredis emits errors during reconnect storms; swallow at listener
      // level so unhandled-error logs don't drown the process. Commands
      // themselves still reject, which is where fail-closed kicks in.
    })
  }

  private sessionKey(sessionId: string): string {
    return `${this.keyPrefix}:session:${sessionId}`
  }

  private cachedTokensKey(userId: string): string {
    return `${this.keyPrefix}:fresh-tokens:${userId}`
  }

  private wrap<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return fn().catch((err) => {
      throw new BackendUpstreamError(`Redis ${label} failed`, err)
    })
  }

  async get(sessionId: string): Promise<StoredSession | null> {
    return this.wrap('GET session', async () => {
      const raw = await this.redis.get(this.sessionKey(sessionId))
      return raw ? (JSON.parse(raw) as StoredSession) : null
    })
  }

  async set(sessionId: string, session: StoredSession): Promise<void> {
    await this.wrap('SET session', async () => {
      await this.redis.set(
        this.sessionKey(sessionId),
        JSON.stringify(session),
        'EX',
        env.SESSION_TTL_SECONDS,
      )
    })
  }

  async touch(sessionId: string): Promise<boolean> {
    return this.wrap('PEXPIRE session', async () => {
      const ttlMs = env.SESSION_TTL_SECONDS * 1000
      const res = (await this.redis.eval(
        TOUCH_LUA,
        1,
        this.sessionKey(sessionId),
        String(ttlMs),
      )) as number
      return res === 1
    })
  }

  async destroy(sessionId: string): Promise<void> {
    await this.wrap('DEL session', async () => {
      await this.redis.del(this.sessionKey(sessionId))
    })
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    return this.wrap('SET NX lock', async () => {
      const token = randomBytes(16).toString('base64url')
      const res = await this.redis.set(
        `${this.keyPrefix}:${key}`,
        token,
        'PX',
        ttlMs,
        'NX',
      )
      return res === 'OK' ? token : null
    })
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.wrap('release lock', async () => {
      await this.redis.eval(RELEASE_LOCK_LUA, 1, `${this.keyPrefix}:${key}`, token)
    })
  }

  async getCachedTokens(userId: string): Promise<TokenPair | null> {
    return this.wrap('GET cached tokens', async () => {
      const raw = await this.redis.get(this.cachedTokensKey(userId))
      return raw ? (JSON.parse(raw) as TokenPair) : null
    })
  }

  async setCachedTokens(userId: string, tokens: TokenPair, ttlMs: number): Promise<void> {
    await this.wrap('SET cached tokens', async () => {
      await this.redis.set(
        this.cachedTokensKey(userId),
        JSON.stringify(tokens),
        'PX',
        ttlMs,
      )
    })
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.redis.ping()
      return res === 'PONG'
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    try {
      await Promise.race([
        this.redis.quit().then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ])
    } finally {
      this.redis.disconnect()
    }
  }
}
