'use client'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'

type InfoDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  dismissLabel?: string
}

export function InfoDialog({
  open,
  onClose,
  title,
  children,
  dismissLabel = '我知道了',
}: InfoDialogProps) {
  const titleId = useId()
  const descId = useId()
  const dismissBtnRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  useEffect(() => {
    if (open && mounted) dismissBtnRef.current?.focus()
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!mounted || !open) return null

  const onScrimClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const tree = (
    <div
      role="presentation"
      onClick={onScrimClick}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-6"
    >
      <div
        data-component="InfoDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="bg-surface-card rounded-2xl shadow-lg w-full max-w-xs px-6 py-6 z-50"
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-ink-AAA text-center mb-3"
        >
          {title}
        </h2>
        <div
          id={descId}
          className="text-sm leading-6 text-ink-AA mb-5 whitespace-pre-line"
        >
          {children}
        </div>
        <button
          ref={dismissBtnRef}
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-full bg-black/5 text-sm text-ink-AAA
                     hover:bg-black/10
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  )

  return createPortal(tree, document.body)
}
