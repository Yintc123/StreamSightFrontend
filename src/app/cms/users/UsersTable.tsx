'use client'

// Spec 011 §5.1 / §5.2 — Admin 帳號管理列表（靜態 UI）。
//
// 這是「可跑的靜態畫面」：互動（搜尋、狀態篩選、開建立/編輯 sheet、刪除
// 確認）全在 local state 上對 MOCK_USERS 操作，**無 fetch / 無 session
// gate**。等 §5.4 BFF route 接上後，local state 換成 TanStack Query，
// onSubmit / onDelete 改打 `/api/cms/users`。

import { useMemo, useState } from 'react'

import { BottomSheet } from '@/components/ui/BottomSheet'
import { EmptyState } from '@/components/ui/EmptyState'

import { MOCK_USERS, type CmsUser } from './mock-users'
import { UserFormSheet, type UserFormValues } from './UserFormSheet'

type StatusFilter = 'all' | 'active' | 'inactive'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '啟用' },
  { key: 'inactive', label: '停用' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

// ── 狀態徽章 ───────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ok'
          : 'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink-A'
      }
    >
      <span
        aria-hidden
        className={active ? 'h-1.5 w-1.5 rounded-full bg-ok' : 'h-1.5 w-1.5 rounded-full bg-ink-A'}
      />
      {active ? '啟用' : '停用'}
    </span>
  )
}

// ── 主元件 ─────────────────────────────────────────────────
export function UsersTable() {
  const [users, setUsers] = useState<CmsUser[]>(MOCK_USERS)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  // sheet 狀態：null = 關；{mode:'create'} = 新增；{mode:'edit', user} = 編輯
  const [sheet, setSheet] = useState<{ mode: 'create'; user?: undefined } | { mode: 'edit'; user: CmsUser } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CmsUser | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      const matchQ = q === '' || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      const matchStatus =
        status === 'all' || (status === 'active' ? u.isActive : !u.isActive)
      return matchQ && matchStatus
    })
  }, [users, query, status])

  // ── 本地 mutation（靜態階段：直接改 in-memory 陣列）────────
  function handleSubmit(values: UserFormValues) {
    if (sheet?.mode === 'edit') {
      setUsers((prev) =>
        prev.map((u) => (u.id === sheet.user.id ? { ...u, ...values } : u)),
      )
    } else {
      const nextId = Math.max(0, ...users.map((u) => u.id)) + 1
      setUsers((prev) => [
        { id: nextId, ...values, createdAt: new Date().toISOString() },
        ...prev,
      ])
    }
    setSheet(null)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    setUsers((prev) => prev.filter((u) => u.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  return (
    <>
      {/* ── 頂部標題列 ── */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface-card px-4 h-14">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-[17px] font-bold leading-[22px] text-ink-AAA truncate">
            使用者管理
          </h1>
          <span className="text-sm text-ink-A shrink-0">{users.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ mode: 'create' })}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand px-3 h-9 text-sm font-semibold text-ink-on-brand
                     hover:bg-brand-400 active:opacity-90
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span aria-hidden className="text-base leading-none">＋</span>
          新增使用者
        </button>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
        {/* ── 工具列：搜尋 + 狀態篩選 ── */}
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">搜尋使用者</span>
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-A">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋名稱或 email"
              className="h-10 w-full rounded-lg border border-line bg-surface-card pl-9 pr-3 text-sm text-ink-AAA placeholder:text-ink-A
                         focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </label>

          {/* 狀態分段控制 */}
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

        {/* ── 清單 ── */}
        {filtered.length === 0 ? (
          <EmptyState
            illustration="/figma/empty-no-data.png"
            title={query.trim() ? '找不到符合的使用者' : '尚無使用者'}
            subtitle={query.trim() ? '試試其他關鍵字或清除篩選' : '按右上角「新增使用者」建立第一個帳號'}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {/* 桌機表頭（≥sm 顯示）；手機以卡片呈現、不顯示表頭 */}
            <li
              aria-hidden
              className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 pb-1 text-xs font-medium text-ink-A"
            >
              <span>名稱 / Email</span>
              <span className="w-16 text-center">狀態</span>
              <span className="w-20 text-right">建立日期</span>
              <span className="w-24 text-right">操作</span>
            </li>

            {filtered.map((u) => (
              <li
                key={u.id}
                className="rounded-xl border border-line bg-surface-card px-4 py-3
                           grid grid-cols-1 gap-2
                           sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4"
              >
                {/* 名稱 + email */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-AAA truncate">{u.name}</p>
                  <p className="text-xs text-ink-A truncate">{u.email}</p>
                </div>

                {/* 狀態 */}
                <div className="sm:w-16 sm:text-center">
                  <StatusBadge active={u.isActive} />
                </div>

                {/* 建立日期 */}
                <p className="text-xs text-ink-A sm:w-20 sm:text-right">
                  {formatDate(u.createdAt)}
                </p>

                {/* 操作 */}
                <div className="flex items-center gap-1 sm:w-24 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: 'edit', user: u })}
                    className="rounded-md px-2 h-8 text-xs font-medium text-brand hover:bg-brand-overlay
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(u)}
                    className="rounded-md px-2 h-8 text-xs font-medium text-danger hover:bg-danger/10
                               focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                  >
                    刪除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ── 建立 / 編輯表單 ── */}
      <UserFormSheet
        open={sheet !== null}
        mode={sheet?.mode ?? 'create'}
        initial={sheet?.mode === 'edit' ? sheet.user : null}
        onClose={() => setSheet(null)}
        onSubmit={handleSubmit}
      />

      {/* ── 刪除確認 ── */}
      <BottomSheet
        open={pendingDelete !== null}
        title="刪除使用者"
        onClose={() => setPendingDelete(null)}
      >
        <div className="flex flex-col gap-5 pb-2">
          <p className="text-sm leading-6 text-ink-AA">
            確定要刪除
            <span className="font-medium text-ink-AAA">「{pendingDelete?.name}」</span>
            嗎？此操作無法復原。
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="flex-1 h-11 rounded-lg border border-line text-sm font-medium text-ink-AA
                         hover:text-ink-AAA focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="flex-1 h-11 rounded-lg bg-danger text-sm font-semibold text-ink-on-brand
                         hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            >
              刪除
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
