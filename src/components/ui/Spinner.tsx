type SpinnerProps = {
  /** SR aria-label；視覺上不顯示（對齊 Figma `shimmer`，只有 icon）。預設「載入中…」 */
  label?: string
  /** size：sm = 16 / md = 24（預設，對齊 Figma `shimmer` 24×24）/ lg = 32 */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Spec 003n — Spinner
 *
 * 對齊 Figma component `shimmer` (1:1017，24×24)：iOS 經典 8-spoke 旋轉指示器。
 * 8 條 rect 環繞中心、opacity 漸層形成「trail」效果，wrapper SVG 用
 * `animate-spin` + `animation-timing-function: steps(8)` 做 8 tick / 0.8s 旋轉。
 *
 * 顏色由 `currentColor` 控（caller 在 wrapper 套 text-* 即可），預設 `text-ink-A`。
 */
export function Spinner({ label = '載入中…', size = 'md' }: SpinnerProps) {
  const wh = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'

  return (
    <span
      data-component="Spinner"
      role="status"
      aria-label={label}
      className={`inline-block ${wh} text-ink-A`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="w-full h-full animate-spin motion-reduce:animate-none"
        style={{
          animationDuration: '0.8s',
          animationTimingFunction: 'steps(8)',
        }}
      >
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <rect
            key={angle}
            x="11"
            y="2"
            width="2"
            height="6"
            rx="1"
            fill="currentColor"
            opacity={(i + 1) / 8}
            transform={`rotate(${angle} 12 12)`}
          />
        ))}
      </svg>
    </span>
  )
}
