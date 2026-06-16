import type { ReactNode } from 'react'

type ReminderNoteProps = {
  children: ReactNode
  className?: string
}

export const REMINDER_DONOR_NAME =
  '送出前請再次確認您填寫的姓名是否正確。若資料有誤將無法申報。'

export function ReminderNote({
  children,
  className = '',
}: ReminderNoteProps) {
  return (
    <p
      data-component="ReminderNote"
      className={`flex items-start gap-2 text-xs text-ink-AA leading-5 ${className}`}
    >
      <ExclamationIcon />
      <span>
        <span className="text-ink-AAA">小提醒：</span>
        {children}
      </span>
    </p>
  )
}

function ExclamationIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="w-4 h-4 mt-0.5 shrink-0 fill-ink-AAA"
    >
      <circle cx="8" cy="8" r="7.5" />
      <rect x="7.1" y="3.6" width="1.8" height="5.6" fill="white" rx="0.4" />
      <rect x="7.1" y="10.4" width="1.8" height="1.8" fill="white" rx="0.4" />
    </svg>
  )
}
