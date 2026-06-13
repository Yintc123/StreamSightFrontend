import 'server-only'

export const MAX_BODY_BYTES = 1_000_000
export const DEFAULT_BACKEND_TIMEOUT_MS = 5_000
export const PRE_REFRESH_MARGIN_MS = 30_000
export const REFRESH_LOCK_TTL_MS = 10_000
export const REFRESH_POLLER_TIMEOUT_MS = 8_000
export const REFRESH_POLLER_INTERVAL_MS = 50
export const FRESH_TOKENS_TTL_MS = 60_000
export const CSRF_TOKEN_BYTES = 32
export const SESSION_ID_BYTES = 32

// ADR 004: access 3h, refresh 30d. Reused by /api/dev/login fake-token issuance.
export const DEV_LOGIN_ACCESS_TTL_MS = 3 * 60 * 60 * 1_000
export const DEV_LOGIN_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1_000

// 001g §5.1: graceful shutdown deadline. Cloud Run gives 10s before SIGKILL;
// leave 2s headroom for the runtime + log flush.
export const SHUTDOWN_DEADLINE_MS = 8_000
