// Spec 011a §3 — /cms/charities admin list.
// RSC fetches the list from BE (via v0.1 user-side fallback until BE 026
// admin GET ships), gates on admin role, hands off rendering to a small
// client wrapper so the AdminPageShell can sit underneath TopNav.

import type { Metadata } from 'next'
import Link from 'next/link'

import { AdminPageShell } from '@/components/cms/AdminPageShell'
import { AdminTable, type AdminTableColumn } from '@/components/cms/AdminTable'

import { backendFetch } from '@/lib/api/backend'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendAdminCharityListResponse,
  type BackendAdminCharityListItem,
} from '@/lib/schemas/admin-detail'
import {
  ensureAdminAccess,
  requireAdminSession,
} from '@/lib/session/requireAdmin'

export const metadata: Metadata = {
  title: '公益團體 | JKODonation',
}

async function fetchAdminCharityList(): Promise<BackendAdminCharityListItem[]> {
  // BE 026 §5.1.1 — admin list endpoint (limit cap 100). Returns rows
  // with admin lifecycle metadata (displayOrder / publish window / etc).
  // v0.1 fetches 100 in one go; pagination chrome lands in v0.2.
  const { data } = await backendFetch<unknown>(
    '/cms/donation/charities?limit=100',
  )
  const parsed = BackendAdminCharityListResponse.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Admin charity list schema mismatch: ${parsed.error.message}`,
    )
  }
  return parsed.data.items
}

const COLUMNS: AdminTableColumn<BackendAdminCharityListItem>[] = [
  { header: '名稱', cell: (r) => r.name, width: 'flex-1' },
  {
    header: '類別',
    cell: (r) =>
      r.categories.length > 0
        ? r.categories.map((c) => c.displayName).join(' / ')
        : '—',
    width: 'w-40',
  },
  {
    header: '排序',
    cell: (r) => r.displayOrder,
    width: 'w-16',
    align: 'right',
  },
  {
    header: '操作',
    cell: (r) => (
      <Link
        href={`/cms/charities/${r.id}/edit`}
        className="text-ink-link text-xs underline-offset-2 hover:underline"
      >
        編輯
      </Link>
    ),
    width: 'w-16',
    align: 'right',
  },
]

export default async function CharityListPage() {
  await requireAdminSession()
  // ensureAdminAccess catches 401 (token expired / revoked) + 403 (admin
  // demoted mid-session) thrown by BE — both signal "this user no longer
  // has admin access", so log out + redirect home rather than dump a
  // generic error UI.
  const items = await ensureAdminAccess(fetchAdminCharityList)
  return (
    <AdminPageShell
      title="公益團體"
      backHref="/cms"
      actions={
        <Link
          href="/cms/charities/new"
          className="w-full h-11 rounded-full bg-brand text-white text-sm font-semibold
                     flex items-center justify-center
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          + 新增
        </Link>
      }
    >
      <AdminTable
        columns={COLUMNS}
        rows={items}
        rowKey={(r) => r.id}
        caption="公益團體清單"
      />
    </AdminPageShell>
  )
}
