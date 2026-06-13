import 'server-only'
import type { StoredSession, TokenPair } from '../types'

export interface SessionStore {
  get(sessionId: string): Promise<StoredSession | null>

  set(sessionId: string, session: StoredSession): Promise<void>

  touch(sessionId: string): Promise<boolean>

  destroy(sessionId: string): Promise<void>

  acquireLock(key: string, ttlMs: number): Promise<string | null>

  releaseLock(key: string, token: string): Promise<void>

  getCachedTokens(userId: string): Promise<TokenPair | null>
  setCachedTokens(userId: string, tokens: TokenPair, ttlMs: number): Promise<void>

  ping(): Promise<boolean>

  close(): Promise<void>
}
