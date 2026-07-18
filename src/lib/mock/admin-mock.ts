// USE_MOCK=1 stand-ins for the admin management backend (spec 013a §3.3).
//
// These cover the HAPPY PATH only — the runtime mock layer has no way to
// model status codes (409/422/404), so all error + guard paths are tested
// via MSW unit/integration tests instead (spec 013a §3.3-2). Every handler
// returns a snake_case shape that passes the BFF Zod validators.

import 'server-only'

import type { MockHandler } from './dispatch'

type AdminRole = 'super_admin' | 'editor' | 'viewer'

function summary(over: {
  id: number
  username: string
  name: string
  admin_role?: AdminRole
  is_protected?: boolean
  is_active?: boolean
  archived_at?: string | null
  deleted_at?: string | null
}) {
  return {
    id: over.id,
    username: over.username,
    name: over.name,
    admin_role: over.admin_role ?? 'viewer',
    is_protected: over.is_protected ?? false,
    is_active: over.is_active ?? true,
    archived_at: over.archived_at ?? null,
    archived_by: null,
    archived_by_username: null,
    deleted_at: over.deleted_at ?? null,
    deleted_by: null,
    deleted_by_username: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  }
}

const SEED = [
  summary({ id: 1, username: 'root', name: 'Root Admin', admin_role: 'super_admin', is_protected: true }),
  summary({ id: 2, username: 'editor1', name: 'Editor One', admin_role: 'editor' }),
  summary({ id: 3, username: 'viewer1', name: 'Viewer One', admin_role: 'viewer' }),
  // Archived + deleted rows so the status filter returns distinct sets
  // (已封存 tab shows the archived row; deleted rows only surface via an
  // explicit status=deleted request — the list no longer has a 已刪除 tab).
  summary({
    id: 4,
    username: 'archived1',
    name: 'Archived One',
    admin_role: 'viewer',
    is_active: false,
    archived_at: '2026-07-11T00:00:00Z',
  }),
  summary({
    id: 5,
    username: 'deleted1',
    name: 'Deleted One',
    admin_role: 'viewer',
    is_active: false,
    deleted_at: '2026-07-12T00:00:00Z',
  }),
]

/** Lifecycle bucket of a seed row — mirrors the backend `status` filter. */
function statusOf(row: (typeof SEED)[number]): 'active' | 'archived' | 'deleted' {
  if (row.deleted_at) return 'deleted'
  if (row.archived_at) return 'archived'
  return 'active'
}

function captured(opts: { query?: Record<string, unknown> }, key: string): string | undefined {
  const v = opts.query?.[`__${key}`]
  return typeof v === 'string' ? v : undefined
}

/** GET → list; POST → created AdminResponse (spec 013a §3.2). */
export const adminCollectionHandler: MockHandler = (opts) => {
  if (opts.method === 'POST') {
    const body = (opts.body ?? {}) as {
      username?: string
      name?: string
      admin_role?: AdminRole
    }
    return {
      id: 100,
      username: body.username ?? 'new-admin',
      name: body.name ?? 'New Admin',
      admin_role: body.admin_role ?? 'viewer',
    }
  }
  // Spec 013b §2.1 — honour the `status` tab filter (all/active/archived/
  // deleted). The real backend filters server-side; the mock must too, or the
  // /cms/admins tabs all show identical rows.
  const status = typeof opts.query?.status === 'string' ? opts.query.status : 'active'
  const items = status === 'all' ? SEED : SEED.filter((s) => statusOf(s) === status)
  return { items, total: items.length, limit: 50, offset: 0 }
}

/** GET → detail summary; PATCH → renamed AdminResponse; DELETE → soft-deleted summary. */
export const adminItemHandler: MockHandler = (opts) => {
  const id = Number(captured(opts, 'id') ?? 2)
  const base = SEED.find((s) => s.id === id) ?? SEED[1]!
  if (opts.method === 'PATCH') {
    const body = (opts.body ?? {}) as { name?: string }
    return { id, username: base.username, name: body.name ?? base.name, admin_role: base.admin_role }
  }
  if (opts.method === 'DELETE') {
    return summary({
      id,
      username: base.username,
      name: base.name,
      admin_role: base.admin_role,
      is_active: false,
      deleted_at: '2026-07-11T00:00:00Z',
    })
  }
  return SEED.find((s) => s.id === id) ?? summary({ id, username: 'unknown', name: 'Unknown' })
}

export const adminRoleHandler: MockHandler = (opts) => {
  const id = Number(captured(opts, 'id') ?? 2)
  const body = (opts.body ?? {}) as { admin_role?: AdminRole }
  const base = SEED.find((s) => s.id === id) ?? SEED[1]!
  return { id, username: base.username, name: base.name, admin_role: body.admin_role ?? 'viewer' }
}

function lifecycleHandler(kind: 'archive' | 'unarchive' | 'restore'): MockHandler {
  return (opts) => {
    const id = Number(captured(opts, 'id') ?? 2)
    const base = SEED.find((s) => s.id === id) ?? SEED[1]!
    return summary({
      id,
      username: base.username,
      name: base.name,
      admin_role: base.admin_role,
      is_active: kind !== 'archive',
      archived_at: kind === 'archive' ? '2026-07-11T00:00:00Z' : null,
    })
  }
}

export const adminArchiveHandler = lifecycleHandler('archive')
export const adminUnarchiveHandler = lifecycleHandler('unarchive')
export const adminRestoreHandler = lifecycleHandler('restore')

// POST /admin/me/password → 204 (no body); route destroys session after.
export const mePasswordHandler: MockHandler = () => null
