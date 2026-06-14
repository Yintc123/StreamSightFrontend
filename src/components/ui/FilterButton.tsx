'use client'

type FilterButtonProps = {
  /** 當前顯示的 label（「全部」或某分類中文名） */
  label: string
  onClick: () => void
  /** 是否展開；用於 aria-expanded 與 caret 旋轉動效 */
  isOpen?: boolean
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function FilterButton({
  label,
  onClick,
  isOpen = false,
}: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-label={`篩選：${label}`}
      className="inline-flex items-center bg-black/5 rounded-md px-3 py-1.5
                 text-sm leading-[22px] text-ink-AA
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span className="whitespace-nowrap font-bold">{label}</span>
      <ChevronDownIcon
        className={`w-4 h-4 ml-1 shrink-0 text-ink-AA transition-transform ${
          isOpen ? 'rotate-180' : ''
        }`}
      />
    </button>
  )
}
