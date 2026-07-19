// USE_MOCK=1 stand-ins for the admin auth bridge that `/api/auth/login`
// invokes. We don't run a real backend in mock mode, so without these
// handlers the login e2e smoke 502s the moment it hits
// `backendFetch('/admin/auth/login')`.
//
// Aligned to the real backend contract (spec 012a §2/§6.6):
//   - /admin/auth/login → snake TokenResponse; JWT carries `role: 1`
//     (ADMIN) + `grade` so the BFF resolves an admin session.
//   - /admin/me → AdminResponse `{ id, username, name, admin_role }`
//     (int id = admin child PK; NO email / is_active / role).

import 'server-only'

import { Role } from '@/lib/session/types'
import type { MockHandler } from './dispatch'

// JWT `sub` is the principal_id (stringified int); /admin/me.id is the admin
// child PK (a different int) — spec 012a §2.7.
const MOCK_PRINCIPAL_ID = '1'
const MOCK_ADMIN_CHILD_ID = 1
// enum-int.md — admin_role / JWT grade are int ranks on the wire (super_admin=100).
const MOCK_ADMIN_ROLE = 100

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64Url({ alg: 'HS256' })}.${base64Url(payload)}.sig`
}

export const loginHandler: MockHandler = () => ({
  access_token: makeJwt({
    sub: MOCK_PRINCIPAL_ID,
    type: 'access',
    role: Role.ADMIN,
    grade: MOCK_ADMIN_ROLE,
  }),
  token_type: 'bearer',
  refresh_token: makeJwt({ sub: MOCK_PRINCIPAL_ID, type: 'refresh' }),
  expires_in: 1800,
})

export const meHandler: MockHandler = () => ({
  id: MOCK_ADMIN_CHILD_ID,
  username: 'admin',
  name: 'Root Admin',
  admin_role: MOCK_ADMIN_ROLE,
})
