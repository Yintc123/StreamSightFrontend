import 'server-only'

// Spec 012a §4.6 — Role is the backend `role` claim (principal type
// discriminator), aligned to the backend IntEnum `USER = 0` / `ADMIN = 1`
// (`app/core/enums.py`). This is the REVERSE of the old JKODonation
// mapping — every `=== Role.ADMIN` comparison flips meaning, so mocks and
// assertions were updated in lockstep (§4.6 warning).
//
// Sessions written before this field existed read back as `role:
// undefined`; admin checks compare `=== Role.ADMIN`, so undefined fails
// closed. Production rollout clears the Redis sessions namespace.
export const Role = { USER: 0, ADMIN: 1 } as const
export type RoleValue = (typeof Role)[keyof typeof Role]

/**
 * admin_role ladder inside the admin principal (spec 012a §4.8). Present
 * only on admin sessions; drives the spec 013 SUPER_ADMIN gate. NOT an
 * authorization boundary on its own — the backend 403/422 is authoritative.
 */
export type AdminRole = 'super_admin' | 'editor' | 'viewer'

export type StoredSession = {
  userId: string
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  refreshTokenExpiresAt: number
  user: { id: string; name: string }
  role: RoleValue
  adminRole?: AdminRole
  csrfToken: string
  createdAt: number
}

export type TokenPair = {
  accessToken: string
  accessTokenExpiresAt: number
  refreshToken: string
  refreshTokenExpiresAt: number
}
