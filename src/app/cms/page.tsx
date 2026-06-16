import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '後台 | JKODonation',
}

/**
 * Spec 005 — 登入後 dashboard placeholder
 *
 * 首頁 LoginCard 登入成功（POST /api/dev/login 200）後 router.push 到
 * 這裡。目前只是 placeholder，session 資訊 / 後台功能後續再補。
 */
export default function DashboardPage() {
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <header className="flex items-center justify-center w-full h-11 bg-brand px-[14px]">
        <h1 className="text-white text-[17px] font-bold leading-[22px]">
          後台
        </h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-4 px-[15px] py-10">
        <p className="text-base text-ink-AAA text-center">
          歡迎進入後台
        </p>
        <p className="text-sm text-ink-AA text-center">
          已建立 dev session（cookie `jko_session`）。後台功能尚未開發。
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
