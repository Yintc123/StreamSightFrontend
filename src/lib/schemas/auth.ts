// Auth-related Zod schemas.
//
// Spec 012a §2/§4.4 — the backend admin auth line (POST /admin/auth/login,
// GET /admin/me, POST /auth/refresh) speaks snake_case with no camelCase
// alias; the BFF absorbs the gap here + in a single `adaptTokenResponse`.
//
// The public self-registration flow (spec 007) was removed by spec 012b;
// its schemas are gone. Field rule constants stay — spec 013 admin schemas
// reuse the same length/regex conventions.

import { z } from 'zod'

// ─── Field rules (username / password) ─────────────────────────────

export const USERNAME_MIN = 3
export const USERNAME_MAX = 30
export const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 256

export const Username = z
  .string()
  .min(USERNAME_MIN, '帳號需為 3–30 個英數字、底線或連字號')
  .max(USERNAME_MAX, '帳號需為 3–30 個英數字、底線或連字號')
  .regex(USERNAME_REGEX, '帳號需為 3–30 個英數字、底線或連字號')

export const Password = z
  .string()
  .min(PASSWORD_MIN, '密碼至少 8 個字元')
  .max(PASSWORD_MAX, '密碼最多 256 字元')

// ─── Backend auth contract (spec 012a §2/§4.4) ────────────────────
//
// The backend speaks snake_case with no global camelCase alias. The BFF
// absorbs the gap in a single adapter (`adaptTokenResponse`) rather than
// scattering field renames across routes.

/** admin_role ladder within the admin principal (spec 012a §1). */
export const AdminRole = z.enum(['super_admin', 'editor', 'viewer'])
export type AdminRole = z.infer<typeof AdminRole>

/**
 * `TokenResponse` (spec 012a §2.4): snake_case, `token_type` lowercase
 * `"bearer"`, `expires_in` is the ACCESS token's remaining seconds. There
 * is no refresh-token expiry field — the BFF derives it from a fallback.
 */
export const BackendTokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.string(), // "bearer"; case-insensitive, not asserted
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(), // access seconds
})
export type BackendTokenResponse = z.infer<typeof BackendTokenResponse>

/**
 * `/admin/me` (spec 012a §2.5): `{ id, username, name, admin_role }`. No
 * email / is_active / role. `id` is the admin child PK (int), NOT the JWT
 * `sub` (principal_id) — do not persist it as the session userId (§4.5).
 */
export const BackendAdminMeResponse = z.object({
  id: z.number().int(),
  username: z.string(),
  name: z.string(),
  admin_role: AdminRole,
})
export type BackendAdminMeResponse = z.infer<typeof BackendAdminMeResponse>

/**
 * BE returns no refresh-token expiry (spec 012a §4.4 / 索引 §OQ-Q2). Track
 * it optimistically with the backend default (14d); reuse detection on the
 * backend is the real guard, so a slightly stale local expiry is safe.
 */
export const REFRESH_TTL_FALLBACK_MS = 14 * 24 * 60 * 60 * 1000

export type AdaptedTokens = {
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  refreshTokenExpiresAt: number
}

/** snake → camel + relative seconds → absolute epoch-ms (spec 012a §4.4). */
export function adaptTokenResponse(
  raw: BackendTokenResponse,
  now: number,
): AdaptedTokens {
  return {
    accessToken: raw.access_token,
    accessTokenExpiresAt: now + raw.expires_in * 1000,
    refreshToken: raw.refresh_token,
    refreshTokenExpiresAt: now + REFRESH_TTL_FALLBACK_MS,
  }
}
