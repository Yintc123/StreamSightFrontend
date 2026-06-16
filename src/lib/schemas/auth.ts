// Spec 007 v0.2 §4.1 — Auth-related Zod schemas (register flow).
//
// Boundary contracts:
//   - RegisterRequest:        client + BFF inbound body
//   - BackendRegisterResponse: shape BE 008 §8.1 returns from POST /auth/register
//   - BackendMeResponse:       shape BE 008 §6.4 returns from GET /auth/me
//   - ClientUser:              shape FE persists in iron-session and shows in UI
//
// Rules mirror BE spec 008 v0.6 verbatim so client / BFF / backend agree
// on lengths and regex; client validation is pre-flight UX, BE is source
// of truth and will reject anything the client failed to catch.

import { z } from 'zod'

// ─── Field rules (BE 008 §3.2 / §3.4) ──────────────────────────────

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

// ─── Request body (client + BFF; passwordConfirm NOT sent) ────────

export const RegisterRequest = z.object({
  username: Username,
  password: Password,
})
export type RegisterRequest = z.infer<typeof RegisterRequest>

// ─── Backend responses ────────────────────────────────────────────

export const BackendRegisterResponse = z.object({
  accessToken: z.string().min(1),
  accessExpiresIn: z.number().int().positive(), // seconds
  refreshToken: z.string().min(1),
  refreshExpiresIn: z.number().int().positive(), // seconds
  tokenType: z.literal('Bearer'),
})
export type BackendRegisterResponse = z.infer<typeof BackendRegisterResponse>

export const BackendMeResponse = z.object({
  id: z.string().min(1),
  username: z.string().nullable(),
  email: z.string().nullable(),
  displayOrder: z.number().int().nullable().optional(),
  // v0.2 — role is optional: BE 008 §6.4 doesn't list it in the /me
  // response table, but the JWT carries `role` per spec 007 §10.10.
  // Until /me is confirmed to return it we accept absence and the BFF
  // can fall back to USER (1).
  role: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  lastLoginAt: z.string().nullable().optional(),
  lastLoginType: z.string().nullable().optional(),
})
export type BackendMeResponse = z.infer<typeof BackendMeResponse>

// ─── Client-facing user (what BFF returns + what session stores) ──

export type ClientUser = {
  id: string
  /** display name for UI; BE returns `username` (may be null if email-only) */
  name: string
  email: string | null
  role: number
}
