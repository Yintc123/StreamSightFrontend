import type { Metadata } from 'next'
import Link from 'next/link'
import { LoginCard } from './LoginCard'

export const metadata: Metadata = {
  title: 'JKODonation',
  description: '登入後台 / 公開捐款項目入口',
}

/**
 * Spec 005 — 首頁 (path: /)
 *
 * 視覺對齊 /donation：brand 紅 header + 卡片風格內容區。提供登入入口
 * （見 LoginCard）+ skip link 直接進公開列表頁。原本的 redirect('/donation')
 * 被 LoginCard + skip link 取代。
 */
export default function HomePage() {
  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <header className="flex items-center justify-center w-full h-11 bg-brand px-[14px]">
        <h1 className="text-white text-[17px] font-bold leading-[22px]">
          JKODonation
        </h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-[15px] py-10">
        <LoginCard />
        <Link
          href="/donation"
          className="text-sm leading-5 text-ink-link underline underline-offset-2
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand rounded"
        >
          demo
        </Link>
      </main>
    </div>
  )
}
