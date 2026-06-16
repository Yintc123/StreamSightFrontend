'use client'
import type { ReactNode } from 'react'

import { useSmartBack } from '@/lib/hooks/useSmartBack'

type TopNavProps = {
  title: string
  /**
   * 自訂返回行為。未傳時用 `useSmartBack(fallback)`：
   *  - 站內已動過 → router.back()
   *  - 直接訪問 / 外站來 / refresh → router.push(fallback)
   * 詳見 spec 005 §4 + `useSmartBack`.
   */
  onBack?: () => void
  /** smart back 的 fallback 目的地，預設 `/`（spec 005 §3 「回首頁」） */
  fallback?: string
  /** 右側 optional 附件（如詳情頁分享按鈕） */
  accessory?: ReactNode
}

export function TopNav({
  title,
  onBack,
  fallback = '/',
  accessory,
}: TopNavProps) {
  const smartBack = useSmartBack(fallback)
  const handleBack = onBack ?? smartBack
  return (
    <header
      data-component="TopNav"
      className="sticky top-0 z-30 flex items-center w-full h-11
                 bg-brand px-[14px] pt-[env(safe-area-inset-top)]"
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="返回"
        className="w-6 h-6 shrink-0 flex items-center justify-center
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-white rounded"
      >
        {/* SVG 24×24 icon — spec 003a §4 允許 <img>；不需 next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/figma/icon-chevron-left.svg" alt="" width={24} height={24} />
      </button>
      <h1 className="flex-1 text-center text-white text-[17px] font-bold leading-[22px] line-clamp-1">
        {title}
      </h1>
      <div className="min-w-6 shrink-0 flex items-center justify-end">
        {accessory}
      </div>
    </header>
  )
}
