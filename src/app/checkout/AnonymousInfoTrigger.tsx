'use client'
import { useRef, useState } from 'react'
import { InfoDialog } from '@/components/ui/InfoDialog'

export const ANONYMOUS_INFO_TITLE = '什麼是匿名捐款？'
export const ANONYMOUS_INFO_BODY =
  '依法除捐贈者事先表示反對外，機關團體須主動公開捐贈之姓名及捐款金額。如您不同意公開請選擇「我要匿名捐款」，您的姓名將不會公開於機關團體網站或捐款芳名錄之上。'

export function AnonymousInfoTrigger() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ANONYMOUS_INFO_TITLE}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-5 h-5 shrink-0
                   text-ink-A hover:text-ink-AAA
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand
                   rounded-full"
      >
        <InfoIcon />
      </button>
      <InfoDialog
        open={open}
        onClose={() => {
          setOpen(false)
          triggerRef.current?.focus()
        }}
        title={ANONYMOUS_INFO_TITLE}
      >
        {ANONYMOUS_INFO_BODY}
      </InfoDialog>
    </>
  )
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="w-4 h-4 fill-current"
    >
      <circle cx="8" cy="8" r="7.5" />
      <rect x="7.1" y="6.6" width="1.8" height="5.4" fill="white" rx="0.4" />
      <circle cx="8" cy="4.5" r="1" fill="white" />
    </svg>
  )
}
