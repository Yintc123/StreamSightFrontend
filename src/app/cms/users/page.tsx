import type { Metadata } from 'next'

import { UsersTable } from './UsersTable'

export const metadata: Metadata = {
  title: '使用者管理 | StreamSight',
}

/**
 * Spec 011 §5 — Admin 帳號管理列表頁（`/cms/users`）。
 *
 * ⚠️ 靜態 UI 階段：本頁**尚未**掛 `requireAdminSession()`（§3.5）守門，
 * 也不打 `GET /api/cms/users`（§5.4）——純視覺 / 排版驗證，資料寫死於
 * `mock-users.ts`。等 admin gate + BFF route 落地後，這裡會 `await
 * requireAdminSession()` 並把首屏資料交給 `<UsersTable />`。
 *
 * RSC 只負責頁面外殼；搜尋 / 篩選 / 開表單等互動全在 client 端
 * `<UsersTable />`。
 */
export default function CmsUsersPage() {
  return (
    <div data-component="CmsUsersPage" className="min-h-dvh bg-surface-page flex flex-col">
      <UsersTable />
    </div>
  )
}
