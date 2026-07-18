// Registration smoke. Importing `./register` runs the side-effect
// registerMock calls once; the auth bridge lookups must then succeed.

import { describe, it, expect, beforeAll } from 'vitest'

import { decodeJwtPayload } from '@/lib/auth/decodeJwtPayload'
import { Role } from '@/lib/session/types'
import { resolveMock, _resetMockRegistry } from './dispatch'

beforeAll(async () => {
  _resetMockRegistry()
  await import('./register')
})

describe('mock/register — admin auth bridge registered', () => {
  it.each(['/admin/auth/login', '/admin/me'])(
    'auth endpoint %s registered',
    (path) => {
      expect(resolveMock(path)).toBeDefined()
    },
  )

  it('/admin/auth/login emits a snake TokenResponse with an admin role JWT', () => {
    const handler = resolveMock('/admin/auth/login')!
    const tokens = handler({}) as {
      access_token: string
      token_type: string
      refresh_token: string
      expires_in: number
    }
    expect(tokens.token_type).toBe('bearer')
    expect(tokens.expires_in).toBeTypeOf('number')
    expect(tokens.refresh_token).toBeTypeOf('string')
    const claims = decodeJwtPayload(tokens.access_token)
    expect(claims?.role).toBe(Role.ADMIN)
    expect(claims?.grade).toBe('super_admin')
  })

  it('/admin/me emits AdminResponse { id:int, username, name, admin_role }', () => {
    const handler = resolveMock('/admin/me')!
    const me = handler({}) as Record<string, unknown>
    expect(me.id).toBeTypeOf('number')
    expect(me.username).toBe('admin')
    expect(me.name).toBeTypeOf('string')
    expect(me.admin_role).toBe('super_admin')
    expect('email' in me).toBe(false)
    expect('role' in me).toBe(false)
  })
})
