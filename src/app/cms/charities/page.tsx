// Spec 011a §3 — /cms/charities admin list.
// RSC fetches the list from BE (via v0.1 user-side fallback until BE 026
// admin GET ships), gates on admin role, hands off rendering to a small
// client wrapper so the AdminPageShell can sit underneath TopNav.

import type { Metadata } from 'next'
import Link from 'next/link'

import { AdminPageShell } from '@/components/cms/AdminPageShell'
import { AdminTable, type AdminTableColumn } from '@/components/cms/AdminTable'
import { z } from 'zod'

import { backendFetch } from '@/lib/api/backend'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import {
  BackendCharityListItem,
  type BackendCharityListItem as CharityListItem,
} from '@/lib/schemas/list'
import { requireAdminSession } from '@/lib/session/requireAdmin'

const ListResponseSchema = z.object({
  items: z.array(BackendCharityListItem),
  nextCursor: z.string().nullable().optional(),
})

export const metadata: Metadata = {
  title: '公益團體 | JKODonation',
}

async function fetchAdminCharityList(): Promise<CharityListItem[]> {
  // v0.1 fallback: BE 026 admin list endpoint not shipped yet — use the
  // user-side list (returns only `whereLive` rows; admin sees the same
  // "in-progress" set as users). Switch to `/cms/donation/charities` when
  // BE 026 v0.1 lands; the wire shape only adds metadata fields.
  const { data } = await backendFetch<unknown>(
    '/user/v1/donation/charities?limit=100',
  )
  const parsed = ListResponseSchema.safeParse(data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Charity list schema mismatch: ${parsed.error.message}`,
    )
  }
  return parsed.data.items
}

const COLUMNS: AdminTableColumn<CharityListItem>[] = [
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
    header: '操作',
    cell: () => (
      // Edit link is a placeholder until BE 026 admin detail ships — the
      // edit form needs displayOrder / publishStartAt / publishEndAt that
      // user-side detail doesn't return (spec 011 §5.4).
      <span className="text-ink-A text-xs">編輯（待 BE）</span>
    ),
    width: 'w-32',
    align: 'right',
  },
]

export default async function CharityListPage() {
  await requireAdminSession()
  const items = await fetchAdminCharityList()
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
