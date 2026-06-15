'use client'
import { useState } from 'react'

type ExpandableTextProps = {
  text: string
  /** 長度嚴格大於 threshold 才顯示「更多」按鈕。預設 100。 */
  threshold?: number
}

/**
 * Spec 004a §4 — 公益團體介紹頁的「簡介 + 更多」展開元件。
 *
 * 預設 collapsed：`<p>` 帶 `line-clamp-3` 截斷，下方一顆「更多」按鈕展開；
 * 展開後拿掉 line-clamp，按鈕改為「收起」。短文不過 threshold 不渲染按鈕。
 *
 * 為何用字數門檻（而非量測 DOM `scrollHeight > clientHeight`）：
 * - 量測要在 mount 後跑 useEffect、SSR/CSR 之間會閃；對 demo 不值得
 * - 字數門檻沒有完全準確但 7 天 demo 夠用
 */
export function ExpandableText({ text, threshold = 100 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = text.length > threshold
  return (
    <div>
      <p
        className={
          expanded
            ? 'text-sm leading-6 text-ink-AAA'
            : 'text-sm leading-6 text-ink-AAA line-clamp-3'
        }
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm text-ink-link
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand rounded"
        >
          {expanded ? '收起' : '更多'}
        </button>
      )}
    </div>
  )
}
