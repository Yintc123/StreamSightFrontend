import type { ReactNode } from 'react'

type RequiredLabelProps = {
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function RequiredLabel({
  htmlFor,
  children,
  className = '',
}: RequiredLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-sm text-ink-AAA ${className}`}
    >
      {children}
      {' '}
      <span className="text-brand" aria-hidden>
        *
      </span>
      <span className="sr-only">必填</span>
    </label>
  )
}
