import { describe, it, expect } from 'vitest'

import { adminCollectionHandler } from './admin-mock'

type Row = { id: number; is_active: boolean; archived_at: string | null; deleted_at: string | null }
type List = { items: Row[]; total: number }

function list(status?: string): List {
  return adminCollectionHandler({
    method: 'GET',
    query: status === undefined ? {} : { status },
  }) as List
}

describe('adminCollectionHandler — status filter (spec 013b §2.1)', () => {
  it('status=all returns every seeded admin', () => {
    const { items, total } = list('all')
    expect(items.length).toBeGreaterThanOrEqual(4)
    expect(total).toBe(items.length)
  })

  it('status=active returns only non-archived, non-deleted admins', () => {
    const { items } = list('active')
    expect(items.length).toBeGreaterThan(0)
    for (const row of items) {
      expect(row.archived_at).toBeNull()
      expect(row.deleted_at).toBeNull()
    }
  })

  it('status=archived returns only archived (not deleted) admins', () => {
    const { items } = list('archived')
    expect(items.length).toBeGreaterThan(0)
    for (const row of items) {
      expect(row.archived_at).not.toBeNull()
      expect(row.deleted_at).toBeNull()
    }
  })

  it('status=deleted returns only soft-deleted admins', () => {
    const { items } = list('deleted')
    expect(items.length).toBeGreaterThan(0)
    for (const row of items) {
      expect(row.deleted_at).not.toBeNull()
    }
  })

  it('the four tabs are mutually distinct (active/archived/deleted partition all)', () => {
    const all = list('all').items.length
    const active = list('active').items.length
    const archived = list('archived').items.length
    const deleted = list('deleted').items.length
    expect(active + archived + deleted).toBe(all)
  })

  it('defaults to active when no status is provided', () => {
    expect(list().items).toEqual(list('active').items)
  })

  it('POST still returns a created AdminResponse (unaffected by filter)', () => {
    const created = adminCollectionHandler({
      method: 'POST',
      body: { username: 'x', name: 'X', admin_role: 'editor' },
    }) as { username: string; admin_role: string }
    expect(created.username).toBe('x')
    expect(created.admin_role).toBe('editor')
  })
})
