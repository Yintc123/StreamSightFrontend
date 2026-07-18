import { describe, it, expect } from 'vitest'
import {
  AdminListQuery,
  AdminCreateInput,
  AdminUpdateInput,
  AdminRoleInput,
  ChangePasswordInput,
  BackendAdminResponse,
  BackendAdminSummary,
  BackendAdminListResponse,
  adaptAdminResponse,
  adaptAdminSummary,
  adaptAdminList,
  toBackendAdminCreate,
  type BackendAdminResponse as TBackendAdminResponse,
  type BackendAdminSummary as TBackendAdminSummary,
} from './admin'

const snakeResponse: TBackendAdminResponse = { id: 5, username: 'jane', name: 'Jane', admin_role: 'editor' }

const snakeSummary: TBackendAdminSummary = {
  id: 5,
  username: 'jane',
  name: 'Jane',
  admin_role: 'editor',
  is_protected: false,
  is_active: true,
  archived_at: null,
  archived_by: null,
  archived_by_username: null,
  deleted_at: null,
  deleted_by: null,
  deleted_by_username: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-02T00:00:00Z',
}

describe('AdminListQuery', () => {
  it('defaults status=active, limit=50, offset=0', () => {
    const q = AdminListQuery.parse({})
    expect(q).toEqual({ status: 'active', limit: 50, offset: 0 })
  })

  it('accepts the four status values', () => {
    for (const status of ['active', 'archived', 'deleted', 'all'] as const) {
      expect(AdminListQuery.parse({ status }).status).toBe(status)
    }
  })

  it('rejects an unknown status', () => {
    expect(AdminListQuery.safeParse({ status: 'pending' }).success).toBe(false)
  })

  it('coerces numeric limit/offset from query strings', () => {
    const q = AdminListQuery.parse({ limit: '25', offset: '10' })
    expect(q.limit).toBe(25)
    expect(q.offset).toBe(10)
  })

  it('caps limit at 200 and rejects negative offset', () => {
    expect(AdminListQuery.safeParse({ limit: '201' }).success).toBe(false)
    expect(AdminListQuery.safeParse({ offset: '-1' }).success).toBe(false)
  })
})

describe('AdminCreateInput (camel, client + BFF inbound)', () => {
  it('accepts a valid payload and defaults adminRole to viewer', () => {
    const out = AdminCreateInput.parse({ username: 'jane', name: 'Jane', password: 'secret12' })
    expect(out.adminRole).toBe('viewer')
  })

  it('rejects a short password', () => {
    expect(
      AdminCreateInput.safeParse({ username: 'j', name: 'J', password: 'short' }).success,
    ).toBe(false)
  })

  it('rejects an empty username / name', () => {
    expect(
      AdminCreateInput.safeParse({ username: '', name: 'J', password: 'secret12' }).success,
    ).toBe(false)
    expect(
      AdminCreateInput.safeParse({ username: 'j', name: '', password: 'secret12' }).success,
    ).toBe(false)
  })
})

describe('AdminUpdateInput / AdminRoleInput / ChangePasswordInput', () => {
  it('AdminUpdateInput accepts { name }', () => {
    expect(AdminUpdateInput.parse({ name: 'New' })).toEqual({ name: 'New' })
  })

  it('AdminRoleInput accepts a valid adminRole', () => {
    expect(AdminRoleInput.parse({ adminRole: 'super_admin' }).adminRole).toBe('super_admin')
    expect(AdminRoleInput.safeParse({ adminRole: 'root' }).success).toBe(false)
  })

  it('ChangePasswordInput requires current + new (min 8)', () => {
    expect(
      ChangePasswordInput.parse({ currentPassword: 'old', newPassword: 'newsecret' }),
    ).toEqual({ currentPassword: 'old', newPassword: 'newsecret' })
    expect(
      ChangePasswordInput.safeParse({ currentPassword: 'old', newPassword: 'x' }).success,
    ).toBe(false)
  })
})

describe('backend response validators', () => {
  it('BackendAdminResponse parses snake shape', () => {
    expect(BackendAdminResponse.parse(snakeResponse)).toEqual(snakeResponse)
  })

  it('BackendAdminSummary keeps timestamps as ISO strings', () => {
    const parsed = BackendAdminSummary.parse(snakeSummary)
    expect(parsed.created_at).toBe('2026-07-01T00:00:00Z')
    expect(typeof parsed.created_at).toBe('string')
  })

  it('BackendAdminListResponse validates items + pagination', () => {
    const parsed = BackendAdminListResponse.parse({
      items: [snakeSummary],
      total: 1,
      limit: 50,
      offset: 0,
    })
    expect(parsed.items).toHaveLength(1)
    expect(parsed.total).toBe(1)
  })
})

describe('adapters snake → camel', () => {
  it('adaptAdminResponse renames admin_role → adminRole', () => {
    expect(adaptAdminResponse(snakeResponse)).toEqual({
      id: 5,
      username: 'jane',
      name: 'Jane',
      adminRole: 'editor',
    })
  })

  it('adaptAdminSummary maps every snake field to camel, timestamps stay ISO', () => {
    const c = adaptAdminSummary(snakeSummary)
    expect(c).toEqual({
      id: 5,
      username: 'jane',
      name: 'Jane',
      adminRole: 'editor',
      isProtected: false,
      isActive: true,
      archivedAt: null,
      archivedBy: null,
      archivedByUsername: null,
      deletedAt: null,
      deletedBy: null,
      deletedByUsername: null,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
    })
  })

  it('adaptAdminList maps items + passes pagination through', () => {
    const c = adaptAdminList({ items: [snakeSummary], total: 3, limit: 50, offset: 0 })
    expect(c.items[0].adminRole).toBe('editor')
    expect(c).toMatchObject({ total: 3, limit: 50, offset: 0 })
  })
})

describe('outbound camel → snake', () => {
  it('toBackendAdminCreate renames adminRole → admin_role', () => {
    expect(
      toBackendAdminCreate({ username: 'j', name: 'J', password: 'secret12', adminRole: 'editor' }),
    ).toEqual({ username: 'j', name: 'J', password: 'secret12', admin_role: 'editor' })
  })
})
