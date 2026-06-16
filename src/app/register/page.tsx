import type { Metadata } from 'next'

import { RegisterCard } from './RegisterCard'

export const metadata: Metadata = {
  title: '建立帳號 | JKODonation',
}

/**
 * Spec 007 v0.2 — `/register` 公開註冊入口。
 *
 * RSC 渲染 brand header + 客戶端 <RegisterCard />（form + submit 邏輯）。
 * 入口來源：首頁 LoginCard 「建立帳號」按鈕 router.push('/register')。
 * 註冊成功（auto-login）→ /cms；按「我已有帳號」→ /。
 *
 * 為何不再用 `/admin`：BE 008 §10 / spec 007 §10 — BE 有 `role=0=ADMIN`
 * 與 `requireAdmin` 後台概念，避免命名衝突，故拆：`/register` 是公開
 * 註冊入口、`/admin` 留給未來真正的管理後台。
 */
export default function RegisterPage() {
  return (
    <div data-component="RegisterPage" className="min-h-dvh bg-surface-page flex flex-col">
      <header className="flex items-center justify-center w-full h-11 bg-brand px-[14px]">
        <h1 className="text-white text-[17px] font-bold leading-[22px]">
          建立帳號
        </h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-[15px] py-10">
        <RegisterCard />
      </main>
    </div>
  )
}
