'use client'

// Spec 016 §6 — CMS 左欄，只顯示「管理後台」系統自身的功能（管理員管理 / 設定）。
// 跨系統切換移至 CmsTopBar；資料平台（Streamlit）的頁面由 Streamlit 自己的左欄呈現。
//
// 「管理員管理」可見性 gate 於 adminRole==='super_admin'（UX affordance；真正邊界為
// /cms/admins 上的 requireSuperAdminSession，013a §2）。

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { AdminRole } from '@/lib/schemas/admin'

export function CmsSideNav({ adminRole }: { adminRole?: AdminRole }) {
  const pathname = usePathname()
  const isSuperAdmin = adminRole === 'super_admin'

  const links: { href: string; label: string }[] = [
    ...(isSuperAdmin ? [{ href: '/cms/admins', label: '管理員管理' }] : []),
    { href: '/cms/settings', label: '設定' },
  ]

  // 尺寸/hover 沿用 spec 016 §4.2：hover 填色（文字色不變）、active 加深填色 + 粗體。
  const itemClass = (active: boolean) =>
    'rounded-lg px-2 h-7 flex items-center gap-2 text-base ' +
    (active
      ? 'bg-nav-active text-ink-AAA font-semibold'
      : 'text-ink-AA font-normal hover:bg-nav-hover')

  return (
    <nav className="w-56 shrink-0 border-r border-line bg-surface-card flex flex-col gap-0.5 px-3 py-3">
      {links.map((link) => {
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
    </nav>
  )
}
