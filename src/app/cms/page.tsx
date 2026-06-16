import type { Metadata } from 'next'
import Link from 'next/link'

import { TopNav } from '@/components/ui/TopNav'
import { requireAdminSession } from '@/lib/session/requireAdmin'

export const metadata: Metadata = {
  title: 'CMS | JKODonation',
}

/**
 * Spec 005 — 登入後 CMS placeholder
 *
 * 首頁 LoginCard 登入成功（POST /api/dev/login 200）/ 註冊 spec 007 成功
 * 後，router.push 到這裡。目前只是 placeholder；session 資訊 / CMS
 * 功能後續再補。
 *
 * 路徑從 `/dashboard` 改成 `/cms`（spec 005 v0.5）：JKODonation 後台
 * 主要做「公益團體 / 募款專案 / 義賣商品」三類資料的 CRUD（對應 BE
 * spec 020 charity / project / sale-item 三套 admin route），語意上是
 * content management，不是純 analytics dashboard；改名讓路徑與業務
 * 領域對齊，也避開 Grafana 等觀測 dashboard 的命名噪音。
 *
 * Auth gate — defense in depth:
 *   1. `src/proxy.ts` 做 optimistic cookie presence check（edge runtime，
 *      無 secret / Redis 存取，快但只能 detect 完全沒登入）
 *   2. 本 RSC 做 full validation（iron-session decrypt + Redis lookup）；
 *      cookie 壞掉 / session 過期 / Redis 沒紀錄 → null → redirect `/`
 * 兩層配合對應 Next.js 16 auth 指南「Optimistic checks + DAL」。
 */
export default async function CmsPage() {
  // Spec 011 §3.5 — admin role gate. Null session OR non-admin →
  // redirect('/?reason=cms-not-admin'); the proxy + spec 010 RSC gate
  // (cookie-presence) still fires first on no-cookie callers.
  const session = await requireAdminSession()

  return (
    <div data-component="CmsPage" className="min-h-dvh bg-surface-page flex flex-col">
      {/* CMS 是 top-level landing；返回語意 = 「回首頁」(也順帶可用作登出
          動線的視覺起點)。用 backHref 強制 push('/')、不依賴 history。 */}
      <TopNav title="後台" backHref="/" />
      <main className="flex-1 px-[15px] py-6 flex flex-col gap-6">
        <header>
          <p className="text-base text-ink-AAA">歡迎，{session.user.name}</p>
          <p className="text-xs text-ink-A mt-1">資料管理後台</p>
        </header>

        {/* Spec 011 §1 — 三個 admin 資源管理入口。v0.1 只 ship charity；
            project / item 等 011b / 011c 上線時把連結改成可點。 */}
        <nav aria-label="資源管理" className="flex flex-col gap-2">
          <Link
            href="/cms/charities"
            className="flex items-center justify-between px-4 py-3 rounded-xl
                       bg-surface-card hover:bg-black/5
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="text-sm text-ink-AAA">公益團體</span>
            <span className="text-sm text-ink-link">›</span>
          </Link>
          <span
            aria-disabled="true"
            className="flex items-center justify-between px-4 py-3 rounded-xl
                       bg-surface-card opacity-60 cursor-not-allowed"
          >
            <span className="text-sm text-ink-AAA">募款專案</span>
            <span className="text-xs text-ink-A">即將推出</span>
          </span>
          <span
            aria-disabled="true"
            className="flex items-center justify-between px-4 py-3 rounded-xl
                       bg-surface-card opacity-60 cursor-not-allowed"
          >
            <span className="text-sm text-ink-AAA">義賣商品</span>
            <span className="text-xs text-ink-A">即將推出</span>
          </span>
        </nav>

        <Link
          href="/donation"
          className="text-sm text-ink-link underline underline-offset-2 self-start"
        >
          前往公開捐款列表
        </Link>
      </main>
    </div>
  )
}
