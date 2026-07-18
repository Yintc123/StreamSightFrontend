import 'server-only'
import { cache } from 'react'
import { randomBytes } from 'node:crypto'
import { readSessionId, writeSessionId, clearSessionCookie, newSessionId } from './cookie'
import { getSessionStore } from './store'
import { backendFetch } from '@/lib/api/backend'
import { BackendTokenResponse, adaptTokenResponse } from '@/lib/schemas/auth'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { BackendUpstreamError } from '@/lib/errors/BackendUpstreamError'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  REFRESH_LOCK_TTL_MS,
  REFRESH_POLLER_TIMEOUT_MS,
  REFRESH_POLLER_INTERVAL_MS,
  FRESH_TOKENS_TTL_MS,
  CSRF_TOKEN_BYTES,
} from '@/lib/api/constants'
import type { AdminRole, RoleValue, StoredSession, TokenPair } from './types'

export interface CreateSessionInput {
  user: { id: string; name: string }
  role: RoleValue
  /** admin_role ladder; only set for admin sessions (spec 012a §4.8). */
  adminRole?: AdminRole
  tokens: TokenPair
}

export type SessionUpdatePatch = Partial<
  Pick<
    StoredSession,
    | 'accessToken'
    | 'accessTokenExpiresAt'
    | 'refreshToken'
    | 'refreshTokenExpiresAt'
    | 'user'
  >
>

export interface SessionService {
  get(): Promise<StoredSession | null>
  create(input: CreateSessionInput): Promise<{ sessionId: string; csrfToken: string }>
  update(patch: SessionUpdatePatch): Promise<void>
  destroy(): Promise<void>
  touch(): Promise<void>
  rotateCsrfToken(): Promise<string>
  refresh(): Promise<StoredSession>
  wasMutated(): boolean
}

function newCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export const getSessionService = cache((): SessionService => {
  const store = getSessionStore()
  let mutated = false

  return {
    async get(): Promise<StoredSession | null> {
      const sid = await readSessionId()
      if (!sid) return null
      return store.get(sid)
    },

    async create(input) {
      const sid = newSessionId()
      const csrfToken = newCsrfToken()
      const session: StoredSession = {
        userId: input.user.id,
        accessToken: input.tokens.accessToken,
        accessTokenExpiresAt: input.tokens.accessTokenExpiresAt,
        refreshToken: input.tokens.refreshToken,
        refreshTokenExpiresAt: input.tokens.refreshTokenExpiresAt,
        user: input.user,
        role: input.role,
        ...(input.adminRole ? { adminRole: input.adminRole } : {}),
        csrfToken,
        createdAt: Date.now(),
      }
      await store.set(sid, session)
      await writeSessionId(sid)
      mutated = true
      return { sessionId: sid, csrfToken }
    },

    async update(patch) {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session to update')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')
      await store.set(sid, { ...current, ...patch })
      mutated = true
    },

    async destroy() {
      const sid = await readSessionId()
      await clearSessionCookie()
      if (sid) await store.destroy(sid).catch(() => {})
      mutated = true
    },

    async touch() {
      const sid = await readSessionId()
      if (!sid) return
      const exists = await store.touch(sid)
      if (!exists) {
        await clearSessionCookie()
        return
      }
      await writeSessionId(sid)
      mutated = true
    },

    async rotateCsrfToken() {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')
      const newToken = newCsrfToken()
      await store.set(sid, { ...current, csrfToken: newToken })
      mutated = true
      return newToken
    },

    async refresh() {
      const sid = await readSessionId()
      if (!sid) throw new UnauthenticatedError('no session to refresh')
      const current = await store.get(sid)
      if (!current) throw new UnauthenticatedError('store has no entry')

      // Admin auth line does not issue refresh tokens; return the live session
      // as-is and let the access token expire naturally.
      if (!current.refreshToken) return current

      const cached = await store.getCachedTokens(current.userId)
      if (cached) {
        const updated: StoredSession = { ...current, ...cached }
        await store.set(sid, updated)
        mutated = true
        return updated
      }

      const lockKey = `refresh-lock:${current.userId}`
      const lockToken = await store.acquireLock(lockKey, REFRESH_LOCK_TTL_MS)

      if (lockToken) {
        try {
          const recheck = await store.getCachedTokens(current.userId)
          if (recheck) {
            const updated: StoredSession = { ...current, ...recheck }
            await store.set(sid, updated)
            mutated = true
            return updated
          }
          let data: TokenPair
          try {
            // Spec 012a §4.7 — send snake body, Zod-validate the snake
            // response, then adapt to camel + absolute time. Do NOT spread the
            // raw response (key mismatch would silently keep the old token →
            // reuse detection → family revocation → forced logout).
            const res = await backendFetch<unknown>('/auth/refresh', {
              method: 'POST',
              body: { refresh_token: current.refreshToken },
              session: null, // explicit per spec 001c §3.2
            })
            const parsed = BackendTokenResponse.safeParse(res.data)
            if (!parsed.success) {
              throw new ContractViolationError(
                `BE /auth/refresh response shape mismatch: ${parsed.error.message}`,
              )
            }
            data = adaptTokenResponse(parsed.data, Date.now())
          } catch (err) {
            // Backend rejected the refresh token (or any other auth failure).
            // Per spec 001c §3 step "401 UNAUTHORIZED → destroy() + 401":
            // wipe the local session so the caller stops retrying with the
            // dead refresh token.
            if (err instanceof UnauthenticatedError) {
              await clearSessionCookie()
              await store.destroy(sid).catch(() => {})
              mutated = true
            }
            throw err
          }
          await store.setCachedTokens(current.userId, data, FRESH_TOKENS_TTL_MS)
          const updated: StoredSession = { ...current, ...data }
          await store.set(sid, updated)
          mutated = true
          return updated
        } finally {
          await store.releaseLock(lockKey, lockToken).catch(() => {})
        }
      }

      const deadline = Date.now() + REFRESH_POLLER_TIMEOUT_MS
      while (Date.now() < deadline) {
        await sleep(REFRESH_POLLER_INTERVAL_MS)
        const polled = await store.getCachedTokens(current.userId)
        if (polled) {
          const updated: StoredSession = { ...current, ...polled }
          await store.set(sid, updated)
          mutated = true
          return updated
        }
      }
      throw new BackendUpstreamError('refresh timeout waiting for lock')
    },

    wasMutated() {
      return mutated
    },
  }
})
