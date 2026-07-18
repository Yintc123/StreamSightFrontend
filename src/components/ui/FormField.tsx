'use client'

// Spec 013b §0.3 — shared label + input + inline error (extracted from the
// CMS form sheets). Error is announced via role="alert" + aria-describedby.

type FormFieldProps = {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  type?: 'text' | 'password'
  autoComplete?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
}

export function FormField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  placeholder,
  disabled,
  readOnly,
}: FormFieldProps) {
  const errId = `${id}-error`
  return (
    // The label is associated via htmlFor (NOT by wrapping the input), so the
    // inline error span sits OUTSIDE the label — otherwise the error text would
    // leak into the field's accessible name. It's linked back via
    // aria-describedby instead.
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] text-ink-AA">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={
          'h-10 rounded-lg border bg-surface-card px-3 text-sm text-ink-AAA placeholder:text-ink-A ' +
          'focus:outline-none focus:ring-1 disabled:opacity-60 read-only:opacity-70 ' +
          (error
            ? 'border-danger focus:border-danger focus:ring-danger'
            : 'border-line focus:border-brand focus:ring-brand')
        }
      />
      {error && (
        <span id={errId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  )
}
