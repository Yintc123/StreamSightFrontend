'use client'

import { toast } from 'sonner'

/**
 * Spec 004a §4 / v0.3 — TopNav accessory：分享按鈕。
 *
 * 走 Web Share API（`navigator.share`），失敗或不支援時 fallback 寫入剪貼簿並
 * 用 sonner toast 告知。完全在 user gesture (click) 內呼叫，避免 NotAllowedError。
 *
 * 失敗矩陣：
 *  - share 成功 → 系統 share sheet 本身就是 feedback，不額外 toast
 *  - share 拋 AbortError（使用者取消）→ 靜默（Web Share API 慣例）
 *  - share 拋其他錯 / share 不存在 → fallback 寫剪貼簿 + toast.success「已複製連結」
 *  - 剪貼簿也失敗 + window.isSecureContext=false（純 HTTP 部署）→
 *    toast.error「HTTP 無法使用分享功能」（指出根因，避免使用者以為 client 壞掉）
 *  - 剪貼簿也失敗 + window.isSecureContext=true（罕見：老瀏覽器 / iframe 權限）→
 *    toast.error「無法分享」（通用訊息）
 *
 * 為何拆兩種訊息：本機 dev (localhost) 跟 prod (純 HTTP) 行為差很大，使用者回報
 * 「prod 跳無法分享」時看到精確訊息能直接導向部署問題；見
 * `docs/tech/secure-context-requirements.md`。
 *
 * 視覺對齊 chevron-left 的 24×24 hit area（Figma IMG_4881 右上角 iOS share icon）。
 */

type ShareIconButtonProps = {
  /** 分享 URL；預設 `window.location.href` */
  url?: string
  /** Web Share API title；預設 `document.title` */
  title?: string
  /** Web Share API text（optional；許多 OS 不渲染但部分會） */
  text?: string
}

async function copyToClipboard(url: string): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard?.writeText
  ) {
    return false
  }
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

export function ShareIconButton({ url, title, text }: ShareIconButtonProps = {}) {
  const handleClick = async () => {
    const shareUrl = url ?? window.location.href
    const shareTitle = title ?? document.title

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          ...(text !== undefined && { text }),
          url: shareUrl,
        })
        return // success — system share sheet IS the feedback
      } catch (err) {
        // AbortError = user dismissed the share sheet. Web Share API convention
        // is to treat as a no-op (not an error).
        if (err instanceof Error && err.name === 'AbortError') return
        // Any other failure: fall through to clipboard fallback.
      }
    }

    const copied = await copyToClipboard(shareUrl)
    if (copied) {
      toast.success('已複製連結')
      return
    }
    // 沒救了：判斷根因 — HTTP 連線（secure context = false）vs 其他原因
    const isInsecureContext =
      typeof window !== 'undefined' && window.isSecureContext === false
    toast.error(isInsecureContext ? 'HTTP 無法使用分享功能' : '無法分享')
  }

  return (
    <button
      data-component="ShareIconButton"
      type="button"
      onClick={handleClick}
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
