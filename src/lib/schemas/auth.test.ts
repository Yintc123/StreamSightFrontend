import { describe, it, expect } from 'vitest'
import {
  AdminRole,
  AdminRoleWire,
  ADMIN_ROLE_RANK,
  toAdminRoleRank,
  BackendTokenResponse,
  BackendAdminMeResponse,
  adaptTokenResponse,
  REFRESH_TTL_FALLBACK_MS,
} from './auth'

describe('AdminRole (internal string enum)', () => {
  it('accepts all four backend admin roles including root', () => {
    expect(AdminRole.parse('super_admin')).toBe('super_admin')
    expect(AdminRole.parse('editor')).toBe('editor')
    expect(AdminRole.parse('viewer')).toBe('viewer')
    expect(AdminRole.parse('root')).toBe('root')
  })

  it('rejects unknown roles', () => {
    expect(AdminRole.safeParse('SUPER_ADMIN').success).toBe(false)
    expect(AdminRole.safeParse('admin').success).toBe(false)
  })
})

// enum-int.md — the backend wire is now an IntEnum rank; the BFF translates
// only at the boundary and keeps the human-readable string internally.
describe('AdminRoleWire (int rank ↔ internal string)', () => {
  it('parses the int rank into the internal string label', () => {
    expect(AdminRoleWire.parse(0)).toBe('viewer')
    expect(AdminRoleWire.parse(50)).toBe('editor')
    expect(AdminRoleWire.parse(100)).toBe('super_admin')
    expect(AdminRoleWire.parse(999)).toBe('root')
  })

  it('rejects the old string wire and off-ladder ints', () => {
    expect(AdminRoleWire.safeParse('super_admin').success).toBe(false)
    expect(AdminRoleWire.safeParse(3).success).toBe(false)
  })

  it('toAdminRoleRank maps internal string → wire int (inverse)', () => {
    expect(toAdminRoleRank('viewer')).toBe(0)
    expect(toAdminRoleRank('editor')).toBe(50)
    expect(toAdminRoleRank('super_admin')).toBe(100)
    expect(toAdminRoleRank('root')).toBe(999)
    expect(ADMIN_ROLE_RANK).toEqual({ viewer: 0, editor: 50, super_admin: 100, root: 999 })
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
  // wire admin_role is the int rank (enum-int.md); it transforms to the string.
  const valid = { id: 1, username: 'root', name: 'Root Admin', admin_role: 100 }

  it('parses the /admin/me payload with int id + transforms admin_role rank→string', () => {
    expect(BackendAdminMeResponse.parse(valid)).toEqual({
      id: 1,
      username: 'root',
      name: 'Root Admin',
      admin_role: 'super_admin',
    })
  })

  it('rejects a string id (BE returns int child PK)', () => {
    expect(BackendAdminMeResponse.safeParse({ ...valid, id: '1' }).success).toBe(false)
  })

  it('does not require email/is_active/role (absent on /admin/me)', () => {
    expect(BackendAdminMeResponse.safeParse(valid).success).toBe(true)
  })

  it('parses admin_role=999 (ROOT) into the internal string', () => {
    expect(BackendAdminMeResponse.parse({ ...valid, admin_role: 999 })).toMatchObject({
      admin_role: 'root',
    })
  })

  it('rejects an unknown admin_role rank (old string / off-ladder int)', () => {
    expect(BackendAdminMeResponse.safeParse({ ...valid, admin_role: 'super_admin' }).success).toBe(false)
    expect(BackendAdminMeResponse.safeParse({ ...valid, admin_role: 3 }).success).toBe(false)
  })
})
