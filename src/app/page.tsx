import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginCard } from './LoginCard'
import { AuthRedirectToast } from './AuthRedirectToast'

export const metadata: Metadata = {
  title: 'StreamSight',
  description: '登入入口',
}

/**
 * 首頁 (path: /)
 *
 * brand 紅 header + 卡片風格內容區，提供登入入口（見 LoginCard）。
 */
export default function HomePage() {
  return (
    <div data-component="HomePage" className="min-h-dvh bg-surface-page flex flex-col">
      <header className="flex items-center justify-center w-full h-11 bg-surface-card border-b-2 border-brand px-[14px]">
        <h1 className="text-ink-AAA text-[17px] font-bold leading-[22px] tracking-tight">
          Stream<span className="text-brand">Sight</span>
        </h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-[15px] py-10">
        {/*
          listens for `?reason=cms-auth` query (set by proxy.ts redirect)
          and fires a toast. `useSearchParams` requires <Suspense> in Next 16.
        */}
        <Suspense fallback={null}>
          <AuthRedirectToast />
        </Suspense>
        <LoginCard />
      </main>
    </div>
  )
}
