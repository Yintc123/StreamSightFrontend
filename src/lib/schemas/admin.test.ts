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
  toBackendRoleUpdate,
  type BackendAdminResponse as TBackendAdminResponse,
  type BackendAdminSummary as TBackendAdminSummary,
} from './admin'

// enum-int.md — the backend wire carries admin_role as the int rank; Zod
// transforms it to the internal string label. So the raw input fed to
// `.parse()` uses ints, while adapters (which run post-parse) receive strings.
const wireResponse = { id: 5, username: 'jane', name: 'Jane', admin_role: 50 }

const wireSummary = {
  id: 5,
  username: 'jane',
  name: 'Jane',
  admin_role: 50,
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

// Post-parse shape (string admin_role) — what adapters consume.
const parsedResponse: TBackendAdminResponse = { ...wireResponse, admin_role: 'editor' }
const parsedSummary: TBackendAdminSummary = { ...wireSummary, admin_role: 'editor' }

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
  it('BackendAdminResponse parses snake shape + transforms admin_role rank→string', () => {
    expect(BackendAdminResponse.parse(wireResponse)).toEqual(parsedResponse)
  })

  it('rejects the old string admin_role wire', () => {
    expect(BackendAdminResponse.safeParse({ ...wireResponse, admin_role: 'editor' }).success).toBe(false)
  })

  it('BackendAdminSummary keeps timestamps as ISO strings', () => {
    const parsed = BackendAdminSummary.parse(wireSummary)
    expect(parsed.created_at).toBe('2026-07-01T00:00:00Z')
    expect(typeof parsed.created_at).toBe('string')
    expect(parsed.admin_role).toBe('editor')
  })

  it('BackendAdminListResponse validates items + pagination', () => {
    const parsed = BackendAdminListResponse.parse({
      items: [wireSummary],
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
    expect(adaptAdminResponse(parsedResponse)).toEqual({
      id: 5,
      username: 'jane',
      name: 'Jane',
      adminRole: 'editor',
    })
  })

  it('adaptAdminSummary maps every snake field to camel, timestamps stay ISO', () => {
    const c = adaptAdminSummary(parsedSummary)
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
    const c = adaptAdminList({ items: [parsedSummary], total: 3, limit: 50, offset: 0 })
    expect(c.items[0].adminRole).toBe('editor')
    expect(c).toMatchObject({ total: 3, limit: 50, offset: 0 })
  })
})

describe('outbound camel → snake (admin_role → int rank)', () => {
  it('toBackendAdminCreate renames adminRole → admin_role rank', () => {
    expect(
      toBackendAdminCreate({ username: 'j', name: 'J', password: 'secret12', adminRole: 'editor' }),
    ).toEqual({ username: 'j', name: 'J', password: 'secret12', admin_role: 50 })
  })

  it('toBackendRoleUpdate sends the int rank', () => {
    expect(toBackendRoleUpdate({ adminRole: 'super_admin' })).toEqual({ admin_role: 100 })
    expect(toBackendRoleUpdate({ adminRole: 'viewer' })).toEqual({ admin_role: 0 })
  })
})
