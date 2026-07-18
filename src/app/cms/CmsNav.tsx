'use client'

// Spec 013b §1 — CMS top navigation. Visibility of the「管理員管理」entry is
// gated on adminRole==='super_admin' — this is a UX affordance only; the real
// gate is requireSuperAdminSession() on /cms/admins (013a §2).
//
// §1.1 登出按鈕：取 CSRF token → POST /api/auth/logout → router.push('/')

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { AdminRole } from '@/lib/schemas/admin'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { getCsrfToken } from '@/lib/client/csrf'

export function CmsNav({ adminRole, name }: { adminRole?: AdminRole; name: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const isSuperAdmin = adminRole === 'super_admin'

  const links: { href: string; label: string }[] = [
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

  return (
    <nav className="flex items-center gap-1 border-b border-line bg-surface-card px-4 h-11">
      <Link href="/cms" className="mr-3 text-[15px] font-bold text-ink-AAA">
        Stream<span className="text-brand">Sight</span>
        <span className="ml-1 text-xs font-normal text-ink-A">CMS</span>
      </Link>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={
              'rounded-md px-3 h-8 inline-flex items-center text-sm font-medium ' +
              (active
                ? 'bg-brand-overlay text-brand'
                : 'text-ink-AA hover:text-ink-AAA')
            }
          >
            {link.label}
          </Link>
        )
      })}
      {/* spec 014b §3.6 — ml-auto 移至容器，name 與 ThemeToggle 並列靠右 */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-ink-A truncate max-w-[40%]">{name}</span>
        <ThemeToggle />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="rounded-md px-3 h-8 inline-flex items-center text-sm font-medium text-ink-AA hover:text-ink-AAA disabled:opacity-50 disabled:cursor-not-allowed"
        >
          登出
        </button>
      </div>
    </nav>
  )
}
