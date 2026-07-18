'use client'

// Spec 016 §6 — 頂部列（兩層導覽的「系統切換」層，跨系統唯一共用 chrome）。
// 左：品牌；中：系統切換（管理後台 → /cms、資料平台 → Streamlit）；右：user / 主題 / 登出。
// 資料平台為外部連結（Streamlit app，經 streamlitBaseUrl），其功能由 Streamlit 自身左欄呈現。
//
// §1.1 登出：取 CSRF token → POST /api/auth/logout → router.push('/')

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { getCsrfToken } from '@/lib/client/csrf'

function streamlitHref(base: string): string {
  return base.replace(/\/$/, '') || '/'
}

export function CmsTopBar({
  name,
  streamlitBaseUrl,
}: {
  name: string
  streamlitBaseUrl: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const cmsActive = pathname === '/cms' || pathname.startsWith('/cms/')

  function handleLogout() {
    if (isPending) return
    setIsPending(true)
    getCsrfToken()
      .then((csrfToken) =>
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrfToken },
        }),
      )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        router.push('/')
      })
      .catch(() => {
        toast.error('登出失敗，請重試')
      })
      .finally(() => setIsPending(false))
  }

  // 系統切換 tab：active 系統以 brand 底色強調（區隔「哪個系統」）；inactive 走中性 hover 填色。
  const systemClass = (active: boolean) =>
    'rounded-lg px-3 h-8 inline-flex items-center text-sm font-medium ' +
    (active ? 'bg-brand-overlay text-brand' : 'text-ink-AA hover:bg-nav-hover')

  return (
    <header className="flex items-center gap-2 border-b border-line bg-surface-card px-4 h-12 shrink-0">
      <Link href="/cms" className="mr-2 text-[15px] font-bold text-ink-AAA">
        Stream<span className="text-brand">Sight</span>
      </Link>

      <nav className="flex items-center gap-1">
        <Link
          href="/cms"
          aria-current={cmsActive ? 'page' : undefined}
          className={systemClass(cmsActive)}
        >
          管理後台
        </Link>
        <a href={streamlitHref(streamlitBaseUrl)} className={systemClass(false)}>
          資料平台
        </a>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-ink-A truncate max-w-[40%]">{name}</span>
        <ThemeToggle />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="rounded-lg px-3 h-8 inline-flex items-center text-sm font-medium text-ink-AA hover:bg-nav-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          登出
        </button>
      </div>
    </header>
  )
}
