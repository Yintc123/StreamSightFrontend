import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Role, type StoredSession } from './types'
import { UnauthenticatedError } from '@/lib/errors/UnauthenticatedError'
import { BackendClientError } from '@/lib/errors/BackendClientError'

const getMock = vi.fn<() => Promise<StoredSession | null>>()
const destroyMock = vi.fn(async () => {})
vi.mock('./service', () => ({
  getSessionService: () => ({ get: getMock, destroy: destroyMock }),
}))

const redirectMock = vi.fn((path: string): never => {
  throw new Error(`REDIRECT:${path}`)
})
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
}))

import { ensureAdminAccess, requireAdminSession } from './requireAdmin'

beforeEach(() => {
  getMock.mockReset()
  destroyMock.mockClear()
  redirectMock.mockClear()
})

function adminSession(): StoredSession {
  const now = Date.now()
  return {
    userId: 'u1',
    accessToken: 'at',
    accessTokenExpiresAt: now + 60_000,
    refreshToken: 'rt',
    refreshTokenExpiresAt: now + 600_000,
    user: { id: 'u1', name: 'Alice' },
    role: Role.ADMIN,
    csrfToken: 'c'.repeat(43),
    createdAt: now,
  }
}

describe('requireAdminSession', () => {
  it('session=null → redirect /?reason=cms-not-admin', async () => {
    getMock.mockResolvedValue(null)
    await expect(requireAdminSession()).rejects.toThrow(/REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith('/?reason=cms-not-admin')
  })

  it('session non-admin → redirect /?reason=cms-not-admin', async () => {
    getMock.mockResolvedValue({ ...adminSession(), role: Role.USER })
    await expect(requireAdminSession()).rejects.toThrow(/REDIRECT/)
    expect(redirectMock).toHaveBeenCalledWith('/?reason=cms-not-admin')
  })

  it('session admin → return session、no redirect', async () => {
    const s = adminSession()
    getMock.mockResolvedValue(s)
    await expect(requireAdminSession()).resolves.toBe(s)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

describe('ensureAdminAccess', () => {
  it('happy path → pass-through 結果', async () => {
    await expect(ensureAdminAccess(async () => 'ok')).resolves.toBe('ok')
    expect(redirectMock).not.toHaveBeenCalled()
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('UnauthenticatedError → destroy + redirect /?reason=cms-not-admin', async () => {
    await expect(
      ensureAdminAccess(async () => {
        throw new UnauthenticatedError('UNAUTHORIZED')
      }),
    ).rejects.toThrow(/REDIRECT/)
    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith('/?reason=cms-not-admin')
  })

  it('BackendClientError 403 → destroy + redirect', async () => {
    await expect(
      ensureAdminAccess(async () => {
        throw new BackendClientError(403, 'FORBIDDEN', 'admin only')
      }),
    ).rejects.toThrow(/REDIRECT/)
    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith('/?reason=cms-not-admin')
  })

  it('BackendClientError 400 → rethrow（非權限錯誤）', async () => {
    const validationErr = new BackendClientError(400, 'VALIDATION_FAILED', 'bad')
    await expect(
      ensureAdminAccess(async () => {
        throw validationErr
      }),
    ).rejects.toBe(validationErr)
    expect(destroyMock).not.toHaveBeenCalled()
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('其他 Error → rethrow', async () => {
    const e = new Error('network')
    await expect(
      ensureAdminAccess(async () => {
        throw e
      }),
    ).rejects.toBe(e)
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
