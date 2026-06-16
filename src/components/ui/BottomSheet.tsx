'use client'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type BottomSheetProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export const SHEET_TRANSITION_MS = 200

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: BottomSheetProps) {
  const titleId = useId()
  const [alive, setAlive] = useState(open)
  const [mounted, setMounted] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // SSR guard：只在 client 第一次 useEffect 後才允許 createPortal。
  // 此 effect 必須 setState 才能觸發 portal mount，與 CategoryMenu 用法一致。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  // alive mirror：open 開啟立刻 alive=true；關閉延遲 SHEET_TRANSITION_MS unmount，
  // 讓退場動畫跑完。屬於 React 與外部 timer 的同步，必須在 effect 中 setState。
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlive(true)
      return
    }
    const t = setTimeout(() => setAlive(false), SHEET_TRANSITION_MS)
    return () => clearTimeout(t)
  }, [open])

  // Initial focus：open 變 true 時 focus 移到 X 按鈕。
  // 第一次 render 因 mounted=false 返回 null（ref 仍 null）；mounted 變 true 後
  // portal 子樹才 commit、ref 才存在。故 deps 含 mounted 才能在掛載後 focus。
  useEffect(() => {
    if (open && mounted) closeButtonRef.current?.focus()
  }, [open, mounted])

  // Esc → onClose
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Focus trap (Tab / Shift+Tab cycles within panel)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!mounted || !alive) return null

  const backdropOpacity = open ? 'opacity-100' : 'opacity-0'
  const panelTranslate = open ? 'translate-y-0' : 'translate-y-full'

  const tree = (
    <div
      role="presentation"
      data-testid="bottom-sheet-backdrop"
      onClick={onClose}
      className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${backdropOpacity}`}
    >
      <div
        ref={panelRef}
        data-component="BottomSheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`fixed inset-x-0 bottom-0 z-50 bg-surface-card rounded-t-2xl
                    max-h-[85vh] flex flex-col
                    pb-[max(0.75rem,env(safe-area-inset-bottom))]
                    transition-transform duration-200 ${panelTranslate}`}
      >
        <header className="flex items-center justify-between px-5 h-14 border-b border-line-soft">
          {/* Left spacer matches close-button width to keep title centered. */}
          <span aria-hidden className="w-6 h-6 shrink-0" />
          <h2
            id={titleId}
            className="flex-1 text-center text-base font-semibold text-ink-AAA"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="w-6 h-6 shrink-0 flex items-center justify-center text-ink-AAA
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )

  return createPortal(tree, document.body)
}
