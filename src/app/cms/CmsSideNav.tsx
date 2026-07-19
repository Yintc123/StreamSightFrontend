'use client'

// Spec 016 §6 — CMS 左欄，只顯示「管理後台」系統自身的功能（管理員管理 / 設定）。
// 跨系統切換移至 CmsTopBar；資料平台（Streamlit）的頁面由 Streamlit 自己的左欄呈現。
//
// 「管理員管理」可見性 gate 於 adminRole==='super_admin'（UX affordance；真正邊界為
// /cms/admins 上的 requireSuperAdminSession，013a §2）。
//
// 016 §4.3（對齊 Streamlit 側欄，實測 stSidebar 2026-07-19）：
//  - 右緣 8px 透明 col-resize 拖曳條（hover 顯示 brand 細條），可拖曳調寬 + 鍵盤 ←→。
//  - 收合＝寬度即時收到 0（無動畫，016 v0.5.2），nav 轉 aria-hidden + inert；左上浮出展開鈕。
//  - 雙箭頭圖示（« / »）、無 border（靠 surface-card vs surface-page 對比分隔）。
// 持久化由 useSidebarPanel 承載（019）：寬度走 sidebar_width cookie（與 Streamlit
// 共用）、收合態走 localStorage。

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { AdminRole } from '@/lib/schemas/admin'
import {
  hasCollapsedPreference,
  useSidebarPanel,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
} from './useSidebarPanel'

const RESIZE_STEP = 16 // 鍵盤每次調整寬度的像素步進

export function CmsSideNav({
  adminRole,
  initialWidth = null,
}: {
  adminRole?: AdminRole
  // 019 §3.5 — layout（RSC）讀 sidebar_width cookie 直出的寬度；SSR first paint 用
  initialWidth?: number | null
}) {
  const pathname = usePathname()
  const { collapsed, width, toggleCollapsed, setWidth } = useSidebarPanel(initialWidth)
  const dragStart = useRef<{ x: number; width: number } | null>(null)

  // Auto-collapse on narrow viewports (mobile) when no collapse preference is
  // saved (019 §I-2: width-only legacy records don't count as a preference).
  // Keeps full-width content on first visit; user can expand manually and the
  // preference persists via localStorage thereafter.
  useEffect(() => {
    if (!hasCollapsedPreference() && window.innerWidth < 768) {
      toggleCollapsed()
    }
  }, [toggleCollapsed])

  const isSuperAdmin = adminRole === 'super_admin' || adminRole === 'root'
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

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    dragStart.current = { x: e.clientX, width }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    if (!start) return
    setWidth(start.width + (e.clientX - start.x))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setWidth(width - RESIZE_STEP)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setWidth(width + RESIZE_STEP)
    }
  }

  return (
    // 外層：寬度即時收合（無 transition，016 v0.5.2），無 border（同 Streamlit）。
    <div
      className="relative shrink-0 bg-surface-card"
      style={{ width: collapsed ? 0 : width }}
    >
      {/* nav 內容：收合時整段 aria-hidden + inert（移出 a11y 樹、不可 focus），寬度固定避免動畫中折行 */}
      <div
        className="h-full overflow-hidden"
        aria-hidden={collapsed}
        inert={collapsed}
      >
        <nav
          className="flex h-full flex-col gap-0.5 px-3 py-3"
          style={{ width }}
        >
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              aria-label="收合側欄"
              title="收合側欄"
              onClick={toggleCollapsed}
              tabIndex={collapsed ? -1 : undefined}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-AA hover:bg-nav-hover"
            >
              <DoubleChevron dir="left" />
            </button>
          </div>

          {links.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`)
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
      </div>

      {/* 右緣拖曳把手：8px 透明 hit 區跨邊（同 Streamlit right:-6px），hover/focus 顯示 brand 細條 */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="調整側欄寬度"
          aria-valuenow={width}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          className="group absolute inset-y-0 -right-1 z-10 flex w-2 cursor-col-resize touch-none select-none justify-center focus-visible:outline-none"
        >
          <span className="h-full w-px bg-transparent transition-colors group-hover:bg-brand group-focus-visible:bg-brand" />
        </div>
      )}

      {/* 收合後：左上浮出展開鈕（同 Streamlit stExpandSidebarButton，keyboard_double_arrow_right） */}
      {collapsed && (
        <button
          type="button"
          aria-label="展開側欄"
          title="展開側欄"
          onClick={toggleCollapsed}
          className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-surface-card text-ink-AA hover:bg-nav-hover"
        >
          <DoubleChevron dir="right" />
        </button>
      )}
    </div>
  )
}

// 雙箭頭（對齊 Streamlit material keyboard_double_arrow_left / right）。
function DoubleChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      {dir === 'left' ? (
        <>
          <polyline points="17 17 12 12 17 7" />
          <polyline points="11 17 6 12 11 7" />
        </>
      ) : (
        <>
          <polyline points="7 17 12 12 7 7" />
          <polyline points="13 17 18 12 13 7" />
        </>
      )}
    </svg>
  )
}
