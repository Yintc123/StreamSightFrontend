type TextareaProps = {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
  required?: boolean
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}

export function Textarea({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 4,
  required,
  ariaInvalid,
  ariaDescribedBy,
}: TextareaProps) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      required={required}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      data-component="Textarea"
      className="w-full rounded-lg border border-line bg-surface-card
                 px-3 py-2 text-sm text-ink-AAA placeholder:text-ink-A
                 focus:border-2 focus:border-ink-AAA focus:outline-none
                 aria-invalid:border-brand resize-y"
    />
  )
}
