import type { ReactNode } from 'react'

type FormFieldProps = {
  id: string
  label: string
  required?: boolean
  error?: string
  children: ReactNode
  hint?: string
}

export function FormField({
  id,
  label,
  required,
  error,
  children,
  hint,
}: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div data-component="FormField" className="space-y-1.5 mb-4">
      <label htmlFor={id} className="block text-sm text-ink-AAA">
        {label}
        {required && (
          <>
            {' '}
            <span aria-hidden className="text-brand">*</span>
            <span className="sr-only">必填</span>
          </>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-A leading-5">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-brand leading-5">
          {error}
        </p>
      )}
    </div>
  )
}
