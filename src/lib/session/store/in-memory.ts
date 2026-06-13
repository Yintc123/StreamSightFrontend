import 'server-only'
import { randomBytes } from 'node:crypto'
import { env } from '@/lib/config'
import type { SessionStore } from './types'
import type { StoredSession, TokenPair } from '../types'

type SessionEntry = { value: StoredSession; expiresAt: number }
type LockEntry = { token: string; expiresAt: number }
type TokenEntry = { value: TokenPair; expiresAt: number }

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionEntry>()
  private readonly locks = new Map<string, LockEntry>()
  private readonly cachedTokens = new Map<string, TokenEntry>()

  async get(sessionId: string): Promise<StoredSession | null> {
    const entry = this.sessions.get(sessionId)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId)
      return null
    }
    return entry.value
  }

  async set(sessionId: string, session: StoredSession): Promise<void> {
    this.sessions.set(sessionId, {
      value: session,
      expiresAt: Date.now() + env.SESSION_TTL_SECONDS * 1000,
    })
  }

  async touch(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId)
      return false
    }
    entry.expiresAt = Date.now() + env.SESSION_TTL_SECONDS * 1000
    return true
  }

  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const existing = this.locks.get(key)
    if (existing && existing.expiresAt > Date.now()) return null
    const token = randomBytes(16).toString('base64url')
    this.locks.set(key, { token, expiresAt: Date.now() + ttlMs })
    return token
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const existing = this.locks.get(key)
    if (!existing) return
    if (existing.expiresAt <= Date.now()) {
      this.locks.delete(key)
      return
    }
    if (existing.token === token) this.locks.delete(key)
  }

  async getCachedTokens(userId: string): Promise<TokenPair | null> {
    const entry = this.cachedTokens.get(userId)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.cachedTokens.delete(userId)
      return null
    }
    return entry.value
  }

  async setCachedTokens(userId: string, tokens: TokenPair, ttlMs: number): Promise<void> {
    this.cachedTokens.set(userId, {
      value: tokens,
      expiresAt: Date.now() + ttlMs,
    })
  }

  async ping(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {
    this.sessions.clear()
    this.locks.clear()
    this.cachedTokens.clear()
  }
}
