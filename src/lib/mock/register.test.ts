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

describe('mock/register — auth bridge registered', () => {
  it.each(['/auth/login', '/auth/me'])('auth endpoint %s registered', (path) => {
    expect(resolveMock(path)).toBeDefined()
  })

  it('/auth/login emits a JWT with admin role claim', () => {
    const handler = resolveMock('/auth/login')!
    const tokens = handler({}) as { accessToken: string; tokenType: string }
    expect(tokens.tokenType).toBe('Bearer')
    const claims = decodeJwtPayload(tokens.accessToken)
    expect(claims?.role).toBe(Role.ADMIN)
  })

  it('/auth/me emits a user shape matching BackendMeResponse (no role field)', () => {
    const handler = resolveMock('/auth/me')!
    const me = handler({}) as Record<string, unknown>
    expect(me.id).toBeTypeOf('string')
    expect(me.username).toBe('admin')
    expect('role' in me).toBe(false)
  })
})
