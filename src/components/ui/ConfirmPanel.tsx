import type { ReactNode } from 'react'

type ConfirmPanelProps = {
  title?: string
  variant?: 'first' | 'normal'
  children: ReactNode
}

export function ConfirmPanel({
  title,
  variant = 'normal',
  children,
}: ConfirmPanelProps) {
  const className = [
    'bg-surface-card rounded-2xl shadow-sm mx-3 mb-3 px-5 py-5',
    variant === 'first' ? '-mt-6 relative z-10' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <section className={className}>
      {title && (
        <h2 className="text-base font-semibold text-ink-AAA text-center mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
