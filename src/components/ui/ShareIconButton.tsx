'use client'

/**
 * Spec 004a §4 — TopNav accessory：分享按鈕（UI only，無實作）。
 *
 * Figma IMG_4881 右上角的 iOS-style share icon。本作業範圍外不接實際分享
 * 功能（spec 005 / brief「分享 icon button：作業範圍外」），點擊只 log 一行
 * placeholder。視覺對齊 chevron-left 的尺寸（24×24 圖 + 24×24 hit area）。
 */
export function ShareIconButton() {
  return (
    <button
      type="button"
      onClick={() => console.log('[share] not implemented (spec 004a UI only)')}
      aria-label="分享"
      className="w-6 h-6 shrink-0 flex items-center justify-center text-white
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-white rounded"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width={20}
        height={20}
        aria-hidden
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </button>
  )
}
