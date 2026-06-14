'use client'
import { useEffect } from 'react'
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

  if (!isOpen) return null

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
        className="fixed inset-0 z-40 bg-black/40 cursor-default"
      />
      <section
        className="fixed inset-x-0 bottom-0 z-50 bg-surface-card rounded-t-2xl
                   shadow-2xl pb-[env(safe-area-inset-bottom)]"
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
