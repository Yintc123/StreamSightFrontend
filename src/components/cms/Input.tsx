type InputProps = {
  id: string
  type?: 'text' | 'email' | 'url' | 'tel'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  required?: boolean
  ariaInvalid?: boolean
  ariaDescribedBy?: string
}

export function Input({
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  maxLength,
  required,
  ariaInvalid,
  ariaDescribedBy,
}: InputProps) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      data-component="Input"
      className="w-full h-11 rounded-lg border border-line bg-surface-card
                 px-3 text-sm text-ink-AAA placeholder:text-ink-A
                 focus:border-2 focus:border-ink-AAA focus:outline-none
                 aria-invalid:border-brand"
    />
  )
}
