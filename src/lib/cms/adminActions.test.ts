import { describe, it, expect } from 'vitest'
import { adminRowActions } from './adminActions'
import type { ClientAdminSummary } from '@/lib/schemas/admin'

function admin(over: Partial<ClientAdminSummary> = {}): ClientAdminSummary {
  return {
    id: 2,
    username: 'editor1',
    name: 'Editor One',
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
    ...over,
  }
}

describe('adminRowActions', () => {
  it('normal active editor (not self): rename / role / archive / delete allowed', () => {
    const a = adminRowActions(admin(), 99)
    expect(a).toMatchObject({
      isSelf: false,
      isProtected: false,
      canRename: true,
      canChangeRole: true,
      canArchive: true,
      canDelete: true,
      canUnarchive: false,
      canRestore: false,
    })
  })

  it('protected root: every mutating action disabled', () => {
    const a = adminRowActions(admin({ id: 1, adminRole: 'super_admin', isProtected: true }), 99)
    expect(a.canRename).toBe(false)
    expect(a.canChangeRole).toBe(false)
    expect(a.canArchive).toBe(false)
    expect(a.canDelete).toBe(false)
    expect(a.rootLabel).toBe(true)
  })

  it('super_admin (non-root): no direct archive/delete — must demote first', () => {
    const a = adminRowActions(admin({ adminRole: 'super_admin' }), 99)
    expect(a.canChangeRole).toBe(true) // can demote
    expect(a.canArchive).toBe(false)
    expect(a.canDelete).toBe(false)
    expect(a.mustDemoteFirst).toBe(true)
  })

  it('self row: dangerous actions disabled (no self archive/delete/role)', () => {
    const a = adminRowActions(admin({ id: 7 }), 7)
    expect(a.isSelf).toBe(true)
    expect(a.canArchive).toBe(false)
    expect(a.canDelete).toBe(false)
    expect(a.canChangeRole).toBe(false)
    expect(a.canRename).toBe(true) // renaming self is fine
  })

  it('archived row: offers unarchive, not archive', () => {
    const a = adminRowActions(
      admin({ isActive: false, archivedAt: '2026-07-05T00:00:00Z' }),
      99,
    )
    expect(a.canArchive).toBe(false)
    expect(a.canUnarchive).toBe(true)
    expect(a.status).toBe('archived')
  })

  it('deleted row: offers restore only', () => {
    const a = adminRowActions(
      admin({ isActive: false, deletedAt: '2026-07-06T00:00:00Z' }),
      99,
    )
    expect(a.status).toBe('deleted')
    expect(a.canRestore).toBe(true)
    expect(a.canArchive).toBe(false)
    expect(a.canUnarchive).toBe(false)
    expect(a.canDelete).toBe(false)
  })
})

describe('adminStatus', () => {
  it('deleted takes precedence over archived', () => {
    const a = adminRowActions(
      admin({ isActive: false, archivedAt: '2026-07-05T00:00:00Z', deletedAt: '2026-07-06T00:00:00Z' }),
      99,
    )
    expect(a.status).toBe('deleted')
  })
})
