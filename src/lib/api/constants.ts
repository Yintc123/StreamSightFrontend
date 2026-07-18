import 'server-only'

export const MAX_BODY_BYTES = 1_000_000
export const DEFAULT_BACKEND_TIMEOUT_MS = 5_000
export const PRE_REFRESH_MARGIN_MS = 30_000
// Spec 012a §4.7 — lock TTL must exceed the backend refresh reuse-detection
// grace (10s) + worst-case refresh latency, so the lock never expires
// mid-refresh and lets a stale token replay past grace → family revocation.
export const REFRESH_LOCK_TTL_MS = 15_000
export const REFRESH_POLLER_TIMEOUT_MS = 8_000
export const REFRESH_POLLER_INTERVAL_MS = 50
export const FRESH_TOKENS_TTL_MS = 60_000
export const CSRF_TOKEN_BYTES = 32
export const SESSION_ID_BYTES = 32

// 001g §5.1: graceful shutdown deadline. Cloud Run gives 10s before SIGKILL;
// leave 2s headroom for the runtime + log flush.
export const SHUTDOWN_DEADLINE_MS = 8_000
