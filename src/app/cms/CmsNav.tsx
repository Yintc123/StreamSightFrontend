'use client'

// Spec 013b §1 — CMS side navigation (left sidebar, Streamlit-style).
// Ordering: 管理員管理 (super_admin only) → 設定 → [divider] → the 5 Streamlit
// pages (dashboard / data / monitor / analytics / admin) as external links.
//
// Visibility of the「管理員管理」entry is gated on adminRole==='super_admin' —
// this is a UX affordance only; the real gate is requireSuperAdminSession() on
// /cms/admins (013a §2). The Streamlit links point at the shared-ALB Streamlit
// app; role gating of 系統管理 is enforced by Streamlit itself.
//
// §1.1 登出按鈕：取 CSRF token → POST /api/auth/logout → router.push('/')

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { AdminRole } from '@/lib/schemas/admin'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { getCsrfToken } from '@/lib/client/csrf'

// Streamlit st.navigation url paths default to each page's filename stem; the
// default page (dashboard) is served at the app root ('').
const STREAMLIT_LINKS: { path: string; label: string }[] = [
  { path: '', label: '儀表板' },
  { path: 'data_management', label: '資料管理' },
  { path: 'realtime_monitor', label: '即時監控' },
  { path: 'analytics', label: '資料分析' },
  { path: 'admin', label: '系統管理' },
]

function streamlitHref(base: string, path: string): string {
  const b = base.replace(/\/$/, '')
  if (!path) return b || '/'
  return b ? `${b}/${path}` : `/${path}`
}

export function CmsNav({
  adminRole,
  name,
  streamlitBaseUrl,
}: {
  adminRole?: AdminRole
  name: string
  streamlitBaseUrl: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const isSuperAdmin = adminRole === 'super_admin'

  const cmsLinks: { href: string; label: string }[] = [
    ...(isSuperAdmin ? [{ href: '/cms/admins', label: '管理員管理' }] : []),
    { href: '/cms/settings', label: '設定' },
  ]

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

  // spec 016 §4.2 — 對齊 Streamlit sidebar nav：hover 為背景填色（文字色不變）、
  // active 為較深填色 + 全不透明文字 + 粗體；尺寸 px-2 / h-7 / rounded-lg / gap-2 / 16px。
  const itemClass = (active: boolean) =>
    'rounded-lg px-2 h-7 flex items-center gap-2 text-base ' +
    (active
      ? 'bg-nav-active text-ink-AAA font-semibold'
      : 'text-ink-AA font-normal hover:bg-nav-hover')

  return (
    <nav className="w-56 shrink-0 border-r border-line bg-surface-card flex flex-col px-3 py-3">
      <Link href="/cms" className="mb-3 px-3 text-[15px] font-bold text-ink-AAA">
        Stream<span className="text-brand">Sight</span>
        <span className="ml-1 text-xs font-normal text-ink-A">CMS</span>
      </Link>

      <div className="flex flex-col gap-0.5">
        {cmsLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={itemClass(active)}
            >
              {link.label}
            </Link>
          )
        })}
      </div>

      <hr className="my-3 border-line" />

      <div className="flex flex-col gap-0.5">
        {STREAMLIT_LINKS.map((link) => (
          <a
            key={link.label}
            href={streamlitHref(streamlitBaseUrl, link.path)}
            className={itemClass(false)}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* footer：帳號 / 主題 / 登出，靠底 */}
      <div className="mt-auto flex flex-col gap-2 pt-3">
        <div className="flex items-center gap-2 px-3">
          <span className="text-xs text-ink-A truncate">{name}</span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="rounded-lg px-2 h-7 flex items-center gap-2 text-base text-ink-AA font-normal hover:bg-nav-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          登出
        </button>
      </div>
    </nav>
  )
}
