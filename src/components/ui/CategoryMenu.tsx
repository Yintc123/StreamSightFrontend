'use client'
import { useEffect, useState } from 'react'
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  type CategoryKey,
} from '@/lib/schemas/categories'

type CategoryMenuProps = {
  isOpen: boolean
  selectedCategory: CategoryKey | null
  onSelect: (next: CategoryKey | null) => void
  onClose: () => void
}

const OPTIONS: { value: CategoryKey | null; label: string }[] = [
  { value: null, label: '全部' },
  ...CATEGORY_KEYS.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
]

/** Animation timing — 與 spec 003m §3 對應 */
const ANIM_MS = 300

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

export function CategoryMenu({
  isOpen,
  selectedCategory,
  onSelect,
  onClose,
}: CategoryMenuProps) {
  // 兩階段 state：
  //   shouldRender — 控 DOM 是否 mount（open 立即 true、close 延遲 ANIM_MS 才 false）
  //   isVisible    — 控 transition 終值（open 用 rAF 延後一格、close 立即 false）
  // 沒兩階段就無法「mount-然後動畫進入」/「動畫退出-再 unmount」。
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(false)

  // Enter / exit animation orchestration — set-state-in-effect rule 對
  // 「mount-then-animate-in / animate-out-then-unmount」這類動畫模式不適用：
  // 我們需要分兩個 commit phase 才能讓 transition 看得到差別，整個 block
  // 都是合法寫法（無 render loop 風險）。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      const raf = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setIsVisible(false)
    const t = setTimeout(() => setShouldRender(false), ANIM_MS)
    return () => clearTimeout(t)
  }, [isOpen])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Esc + body scroll lock 綁 isOpen（不綁 shouldRender）：
  // close 後 ANIM_MS 內仍可見 sheet 退出動畫，但鍵盤 / scroll 已交還使用者。
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  if (!shouldRender) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-sheet-title"
    >
      <button
        type="button"
        aria-label="關閉選單"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 cursor-default
                    transition-opacity duration-300 ease-out
                    motion-reduce:transition-none
                    ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      />
      <section
        className={`fixed inset-x-0 bottom-0 z-50 bg-surface-card rounded-t-2xl
                    shadow-2xl pb-[env(safe-area-inset-bottom)]
                    transition-transform duration-300 ease-out
                    motion-reduce:transition-none
                    ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <header className="relative flex items-center justify-center px-4 py-4 border-b border-line-soft">
          <h2
            id="category-sheet-title"
            className="text-base font-medium text-ink-AAA"
          >
            選擇類別
          </h2>
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center
                       text-ink-AA focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-brand rounded"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </header>
        <div
          role="radiogroup"
          aria-labelledby="category-sheet-title"
          className="grid grid-cols-3 gap-3 px-4 py-4"
        >
          {OPTIONS.map((opt) => {
            const isSelected = opt.value === selectedCategory
            const key = opt.value ?? '__all__'
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  onSelect(opt.value)
                  onClose()
                }}
                className={`h-11 rounded-md border text-sm px-2 flex items-center justify-center text-center
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand
                  ${
                    isSelected
                      ? 'border-brand text-brand bg-surface-card'
                      : 'border-line text-ink-AA bg-surface-card'
                  }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
