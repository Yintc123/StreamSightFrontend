import 'server-only'
import { env } from '@/lib/config'
import { log } from '@/lib/log'
import { resolveMock } from '@/lib/mock/dispatch'
import { BackendTimeoutError } from '@/lib/errors/BackendTimeoutError'
import { BackendUpstreamError } from '@/lib/errors/BackendUpstreamError'
import { BackendClientError } from '@/lib/errors/BackendClientError'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { BffError } from '@/lib/errors/BffError'
import { getSessionService } from '@/lib/session/service'
import type { StoredSession } from '@/lib/session/types'
import {
  outboundTraceHeaders,
  outboundBaggageHeaders,
} from '@/lib/observability/trace'
import { DEFAULT_BACKEND_TIMEOUT_MS, PRE_REFRESH_MARGIN_MS } from './constants'
import { newRequestId } from './request-id'

export type BackendFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  timeoutMs?: number
  headers?: Record<string, string>
  session?: StoredSession | null
  requestId?: string
  /**
   * When true, 4xx responses (other than 401/404 which retain their
   * dedicated mappings) propagate as `BackendClientError` carrying the
   * upstream status and error code. Default false → collapses to
   * `BackendUpstreamError` (502). Set on routes whose 4xx codes carry
   * business meaning the FE must surface — e.g. POST /auth/register.
   */
  passClientErrors?: boolean
}

export type BackendResponse<T> = { data: T; requestId: string }

export async function backendFetch<T = unknown>(
  path: string,
  options: BackendFetchOptions = {},
): Promise<BackendResponse<T>> {
  const requestId = options.requestId ?? newRequestId()
  const start = Date.now()
  const method = options.method ?? 'GET'
  log.info({ requestId, path, method }, 'bff.upstream.start')

  try {
    if (env.USE_MOCK === '1') {
      // Ensure mock dispatchers are registered in THIS module graph.
      // Next.js / Turbopack route handlers can run in a worker that
      // doesn't share state with `instrumentation.ts`, so the
      // boot-time import there isn't enough.
      await ensureMocksRegistered()
      const handler = resolveMock(path)
      if (!handler) throw new BackendUpstreamError(`No mock registered for ${path}`)
      const data = handler({
        query: options.query,
        body: options.body,
        method,
      }) as T
      log.info(
        { requestId, durationMs: Date.now() - start },
        'bff.upstream.mock.ok',
      )
      return { data, requestId }
    }

    const headers: Record<string, string> = {
      'x-request-id': requestId,
      'content-type': 'application/json',
      // Spec 001h §5.1 — manual W3C trace-context + baggage injection (kept
      // deterministic + testable rather than relying on fetch auto-instrument).
      // traceparent: from the active span (empty if none). baggage: non-PII
      // session.id + enduser.id, built from the session we already hold.
      ...outboundTraceHeaders(),
      ...outboundBaggageHeaders(options.session ?? null),
      ...options.headers,
    }

    const inputSession = options.session ?? null
    let activeSession: StoredSession | null = inputSession
    if (inputSession) {
      if (inputSession.accessTokenExpiresAt < Date.now() + PRE_REFRESH_MARGIN_MS) {
        activeSession = await getSessionService().refresh()
      }
      headers.authorization = `Bearer ${activeSession!.accessToken}`
    }

    const url = buildUrl(env.BACKEND_API_URL!, path, options.query)
    const body = options.body != null ? JSON.stringify(options.body) : undefined
    const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw classifyNetworkError(err)
    }

    let retried = false
    if (response.status === 401) {
      const errBody = await safeReadJson(response)
      const backendCode = readBackendCode(errBody)

      // Spec 012a §4.10 — the backend collapses every 401 (expired / invalid
      // / disabled) to a single generic `unauthorized` code, so we cannot
      // gate the refresh on a specific code. Instead: any logged-in call that
      // 401s gets ONE refresh + retry. A 401 in a non-safe mutation means the
      // backend rejected it at the authz layer BEFORE executing, so retrying
      // it is safe. Internal `session: null` calls (e.g. /auth/refresh itself)
      // skip this so we don't recurse.
      if (activeSession) {
        const refreshed = await getSessionService().refresh()
        // Spec 012a §4.10 / §OQ-Q7 — admin auth line returns refresh_token: null,
        // so refresh() is a no-op that returns the same session unchanged. Retrying
        // with the same expired token would produce another 401; skip the retry and
        // destroy the session immediately so the caller redirects to login.
        if (refreshed.accessToken === activeSession.accessToken) {
          await getSessionService().destroy().catch(() => {})
          throw new UnauthenticatedError('access token expired, no refresh token')
        }
        headers.authorization = `Bearer ${refreshed.accessToken}`
        try {
          response = await fetch(url, {
            method,
            headers,
            body,
            signal: AbortSignal.timeout(timeoutMs),
          })
        } catch (err) {
          throw classifyNetworkError(err)
        }
        retried = true
      } else {
        // No session to refresh/revoke — collapse to UNAUTHENTICATED so the
        // caller (e.g. SessionService.refresh) can wire its own destroy.
        throw new UnauthenticatedError(backendCode ?? 'UNAUTHORIZED')
      }
    }

    if (retried && response.status === 401) {
      await getSessionService().destroy().catch(() => {})
      throw new UnauthenticatedError('refresh succeeded but retry still 401')
    }

    if (!response.ok) {
      if (response.status === 404) throw new NotFoundError(`Backend 404 on ${path}`)
      if (response.status >= 500) {
        throw new BackendUpstreamError(`Backend ${response.status}`)
      }
      // 4xx (excluding 401 handled above, 404 handled above): default is to
      // treat as upstream contract drift (502). Routes that need the actual
      // status to reach the FE opt in via `passClientErrors`.
      if (options.passClientErrors) {
        const errBody = await safeReadJson(response)
        const beCode = readBackendCode(errBody)
        const beMsg = readBackendMessage(errBody)
        const message =
          beMsg && beMsg.length > 0 ? beMsg : `Backend ${response.status}`
        throw new BackendClientError(response.status, beCode, message)
      }
      throw new BackendUpstreamError(`Unexpected backend status ${response.status}`)
    }

    // 204 No Content (e.g. POST /admin/me/password, logout) has no body.
    if (response.status === 204) {
      log.info(
        { requestId, durationMs: Date.now() - start, status: 204 },
        'bff.upstream.ok',
      )
      return { data: undefined as T, requestId }
    }

    let data: T
    try {
      data = (await response.json()) as T
    } catch {
      throw new BackendUpstreamError('Backend response not valid JSON')
    }

    log.info(
      { requestId, durationMs: Date.now() - start, status: response.status },
      'bff.upstream.ok',
    )
    return { data, requestId }
  } catch (err) {
    log.warn(
      { requestId, durationMs: Date.now() - start, code: errorCodeOf(err) },
      'bff.upstream.error',
    )
    throw err
  }
}

function errorCodeOf(err: unknown): string {
  return err instanceof BffError ? err.code : 'UNKNOWN'
}

function buildUrl(
  base: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, base.endsWith('/') ? base : base + '/')
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

let mocksRegistered = false
async function ensureMocksRegistered(): Promise<void> {
  if (mocksRegistered) return
  // Side-effect import: calls `registerMock` once per process for every
  // /user/v1/donation/* upstream path.
  await import('@/lib/mock/register')
  mocksRegistered = true
}

function classifyNetworkError(err: unknown): BffError {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return new BackendTimeoutError(err.message, err)
    }
    const code = (err as { code?: string }).code
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      return new BackendUpstreamError(err.message, err)
    }
  }
  return new BackendUpstreamError('Network error', err)
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.clone().json()
  } catch {
    return null
  }
}

/**
 * Spec 012a §4.10 — the backend error body is `{ error: '<code>', message,
 * details }` where `error` is a FLAT string code. A legacy defensive branch
 * still reads a nested `error.code` object shape in case anything upstream
 * has not migrated.
 */
function readBackendCode(errBody: unknown): string | null {
  const e = (errBody as { error?: unknown } | null | undefined)?.error
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    return (e as { code?: string }).code ?? null
  }
  return null
}

/** Prefer the top-level `message`; fall back to a nested `error.message`. */
function readBackendMessage(errBody: unknown): string | null {
  const top = (errBody as { message?: unknown } | null | undefined)?.message
  if (typeof top === 'string' && top.length > 0) return top
  const e = (errBody as { error?: unknown } | null | undefined)?.error
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string' && m.length > 0) return m
  }
  return null
}
