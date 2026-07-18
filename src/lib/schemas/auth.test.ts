import { describe, it, expect } from 'vitest'
import {
  AdminRole,
  BackendTokenResponse,
  BackendAdminMeResponse,
  adaptTokenResponse,
  REFRESH_TTL_FALLBACK_MS,
} from './auth'

describe('AdminRole', () => {
  it('accepts the three backend admin roles', () => {
    expect(AdminRole.parse('super_admin')).toBe('super_admin')
    expect(AdminRole.parse('editor')).toBe('editor')
    expect(AdminRole.parse('viewer')).toBe('viewer')
  })

  it('rejects unknown roles', () => {
    expect(AdminRole.safeParse('root').success).toBe(false)
    expect(AdminRole.safeParse('SUPER_ADMIN').success).toBe(false)
  })
})

describe('BackendTokenResponse (snake_case)', () => {
  const valid = {
    access_token: 'jwt.abc.def',
    token_type: 'bearer',
    refresh_token: 'opaque-refresh',
    expires_in: 1800,
  }

  it('parses the backend snake_case token payload', () => {
    expect(BackendTokenResponse.parse(valid)).toEqual(valid)
  })

  it('accepts token_type regardless of case (no z.literal("Bearer"))', () => {
    expect(BackendTokenResponse.safeParse({ ...valid, token_type: 'Bearer' }).success).toBe(true)
  })

  it('does not require a refresh expiry field', () => {
    // BE only returns expires_in (access). No refresh_expires_in.
    expect(BackendTokenResponse.safeParse(valid).success).toBe(true)
  })

  it('rejects a camelCase payload (old contract)', () => {
    const camel = {
      accessToken: 'a',
      refreshToken: 'r',
      accessExpiresIn: 1,
      refreshExpiresIn: 2,
      tokenType: 'Bearer',
    }
    expect(BackendTokenResponse.safeParse(camel).success).toBe(false)
  })

  it('rejects non-positive expires_in', () => {
    expect(BackendTokenResponse.safeParse({ ...valid, expires_in: 0 }).success).toBe(false)
  })

  it('accepts refresh_token: null (admin auth line does not issue refresh tokens)', () => {
    expect(BackendTokenResponse.safeParse({ ...valid, refresh_token: null }).success).toBe(true)
  })
})

describe('adaptTokenResponse', () => {
  const now = 1_700_000_000_000

  it('maps snake→camel and converts expires_in to an absolute access expiry', () => {
    const out = adaptTokenResponse(
      { access_token: 'A', token_type: 'bearer', refresh_token: 'R', expires_in: 1800 },
      now,
    )
    expect(out.accessToken).toBe('A')
    expect(out.refreshToken).toBe('R')
    expect(out.accessTokenExpiresAt).toBe(now + 1800 * 1000)
  })

  it('maps null refresh_token to null in adapted output', () => {
    const out = adaptTokenResponse(
      { access_token: 'A', token_type: 'bearer', refresh_token: null, expires_in: 1800 },
      now,
    )
    expect(out.refreshToken).toBeNull()
    expect(out.refreshTokenExpiresAt).toBe(0)
  })

  it('derives refresh expiry from the 14d fallback (BE returns no refresh expiry)', () => {
    const out = adaptTokenResponse(
      { access_token: 'A', token_type: 'bearer', refresh_token: 'R', expires_in: 1800 },
      now,
    )
    expect(out.refreshTokenExpiresAt).toBe(now + REFRESH_TTL_FALLBACK_MS)
    expect(REFRESH_TTL_FALLBACK_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
})

describe('BackendAdminMeResponse', () => {
  const valid = { id: 1, username: 'root', name: 'Root Admin', admin_role: 'super_admin' }

  it('parses the /admin/me payload with int id', () => {
    expect(BackendAdminMeResponse.parse(valid)).toEqual(valid)
  })

  it('rejects a string id (BE returns int child PK)', () => {
    expect(BackendAdminMeResponse.safeParse({ ...valid, id: '1' }).success).toBe(false)
  })

  it('does not require email/is_active/role (absent on /admin/me)', () => {
    expect(BackendAdminMeResponse.safeParse(valid).success).toBe(true)
  })

  it('rejects an unknown admin_role', () => {
    expect(BackendAdminMeResponse.safeParse({ ...valid, admin_role: 'root' }).success).toBe(false)
  })
})
