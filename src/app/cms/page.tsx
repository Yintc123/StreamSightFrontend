import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSessionService } from '@/lib/session/service'

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
  const session = await getSessionService().get()
  // `?reason=cms-auth` mirrors the proxy redirect so the homepage's
  // AuthRedirectToast can fire whether the gate caught us at edge (proxy)
  // or here in the RSC. See spec 010 §3.3.
  if (!session) redirect('/?reason=cms-auth')

  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <header className="flex items-center justify-center w-full h-11 bg-brand px-[14px]">
        <h1 className="text-white text-[17px] font-bold leading-[22px]">
          後台
        </h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-[15px] py-10">
        <p className="text-base text-ink-AAA text-center">
          歡迎進入後台，{session.user.name}
        </p>
        <p className="text-sm text-ink-AA text-center">
          已驗證 session（cookie `jko_session`）。後台 CMS 功能尚未開發。
        </p>
        <Link
          href="/donation"
          className="text-sm text-ink-link underline underline-offset-2"
        >
          前往公開捐款列表
        </Link>
      </main>
    </div>
  )
}
