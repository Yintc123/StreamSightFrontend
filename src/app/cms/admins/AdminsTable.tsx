'use client'

// Spec 013b §2.1 — admin management list. TanStack Query drives the data;
// per-row action availability comes from the tested `adminRowActions` matrix.
// Search is client-side (admins are few); status tabs map to the backend
// `status` query param. Mutations invalidate ['cms-admins'] on success.

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineError } from '@/components/ui/InlineError'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/date'
import { adminRowActions } from '@/lib/cms/adminActions'
import type { AdminListQuery, ClientAdmin, ClientAdminSummary } from '@/lib/schemas/admin'

import { fetchAdmins, fetchMe } from './api'
import { AdminFormSheet } from './AdminFormSheet'
import { AdminRoleControl } from './AdminRoleControl'
import { AdminLifecycleMenu } from './AdminLifecycleMenu'

type StatusTab = AdminListQuery['status']

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '啟用' },
  { key: 'archived', label: '已封存' },
  { key: 'deleted', label: '已刪除' },
]

export function AdminsTable() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StatusTab>('active')
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<
    { mode: 'create' } | { mode: 'edit'; admin: ClientAdmin } | null
  >(null)

  const adminsQuery = useQuery({
    queryKey: ['cms-admins', status],
    queryFn: () => fetchAdmins(status),
  })
  const meQuery = useQuery({ queryKey: ['cms-me'], queryFn: fetchMe })
  const myAdminId = meQuery.data?.id ?? null

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cms-admins'] })

  const items = useMemo(
    () => adminsQuery.data?.items ?? [],
    [adminsQuery.data],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (a) =>
        a.username.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    )
  }, [items, query])

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-card px-4 h-14">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-[17px] font-bold leading-[22px] text-ink-AAA truncate">
            管理員管理
          </h1>
          <span className="text-sm text-ink-A shrink-0">{items.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ mode: 'create' })}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand px-3 h-9 text-sm font-semibold text-ink-on-brand
                     hover:bg-brand-400 active:opacity-90
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden className="text-base leading-none">＋</span>
          新增管理員
        </button>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="sr-only">搜尋管理員</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋帳號或名稱"
              className="h-10 w-full rounded-lg border border-line bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A
                         focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>

          <div
            role="tablist"
            aria-label="狀態篩選"
            className="inline-flex self-start rounded-lg border border-line bg-surface-card p-0.5"
          >
            {STATUS_TABS.map((tab) => {
              const selected = status === tab.key
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={selected}
                  type="button"
                  onClick={() => setStatus(tab.key)}
                  className={
                    selected
                      ? 'rounded-md px-3 h-8 text-sm font-medium bg-brand text-ink-on-brand'
                      : 'rounded-md px-3 h-8 text-sm font-medium text-ink-AA hover:text-ink-AAA'
                  }
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {adminsQuery.isPending ? (
          <div className="flex justify-center py-16 text-ink-A">
            <Spinner size="lg" />
          </div>
        ) : adminsQuery.isError ? (
          <InlineError onRetry={() => adminsQuery.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            illustration="/figma/empty-no-data.png"
            title={query.trim() ? '找不到符合的管理員' : '尚無管理員'}
            subtitle={query.trim() ? '試試其他關鍵字' : '按右上角「新增管理員」建立第一個帳號'}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((admin) => (
              <AdminRow
                key={admin.id}
                admin={admin}
                myAdminId={myAdminId}
                onEdit={() => setSheet({ mode: 'edit', admin })}
                onChanged={invalidate}
              />
            ))}
          </ul>
        )}
      </main>

      <AdminFormSheet
        open={sheet !== null}
        mode={sheet?.mode ?? 'create'}
        initial={sheet?.mode === 'edit' ? sheet.admin : null}
        onClose={() => setSheet(null)}
        onSuccess={() => {
          setSheet(null)
          invalidate()
        }}
      />
    </>
  )
}

function AdminRow({
  admin,
  myAdminId,
  onEdit,
  onChanged,
}: {
  admin: ClientAdminSummary
  myAdminId: number | null
  onEdit: () => void
  onChanged: () => void
}) {
  const actions = adminRowActions(admin, myAdminId)
  return (
    <li
      data-testid={`admin-row-${admin.id}`}
      className="rounded-xl border border-line bg-surface-card px-4 py-3
                 grid grid-cols-1 gap-2
                 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-AAA truncate">
          {admin.name}
          {actions.rootLabel && (
            <span className="ml-2 rounded bg-brand-overlay px-1.5 py-0.5 text-[10px] font-medium text-brand">
              root · 不可移除
            </span>
          )}
          {actions.isSelf && (
            <span className="ml-2 text-[10px] text-ink-A">（你自己）</span>
          )}
        </p>
        <p className="text-xs text-ink-A truncate">@{admin.username}</p>
      </div>

      <div className="sm:w-28">
        <AdminRoleControl
          admin={admin}
          disabled={!actions.canChangeRole}
          onChanged={onChanged}
        />
      </div>

      <div className="flex items-center gap-2 sm:w-40 sm:justify-end">
        <StatusBadge status={actions.status} />
        <span className="text-xs text-ink-A">{formatDate(admin.createdAt)}</span>
      </div>

      <div className="flex items-center gap-1 sm:justify-end">
        {actions.canRename && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md px-2 h-8 text-xs font-medium text-brand hover:bg-brand-overlay
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            編輯
          </button>
        )}
        {actions.mustDemoteFirst && (
          <span className="text-[10px] text-ink-A">先降級才能封存/刪除</span>
        )}
        <AdminLifecycleMenu admin={admin} actions={actions} onChanged={onChanged} />
      </div>
    </li>
  )
}
