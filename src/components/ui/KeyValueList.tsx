import type { ReactNode } from 'react'

type KeyValueListProps = {
  labelWidth?: string
  children: ReactNode
}

type KeyValueRowProps = {
  label: string
  children: ReactNode
  variant?: 'normal' | 'emphasized'
}

export function KeyValueList({
  labelWidth = '6em',
  children,
}: KeyValueListProps) {
  return (
    <dl
      className="grid gap-y-3 text-sm"
      style={{ gridTemplateColumns: `${labelWidth} 1fr` }}
    >
      {children}
    </dl>
  )
}

export function KeyValueRow({
  label,
  children,
  variant = 'normal',
}: KeyValueRowProps) {
  const ddClass =
    variant === 'emphasized'
      ? 'text-right text-brand text-base font-bold'
      : 'text-right text-ink-AAA line-clamp-2'
  return (
    <>
      <dt className="text-ink-AA">{label}</dt>
      <dd className={ddClass}>{children}</dd>
    </>
  )
}
