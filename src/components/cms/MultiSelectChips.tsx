type MultiSelectChipsProps<T extends string> = {
  options: { value: T; label: string }[]
  value: T[]
  onChange: (value: T[]) => void
  max?: number
  ariaLabel?: string
}

export function MultiSelectChips<T extends string>({
  options,
  value,
  onChange,
  max,
  ariaLabel,
}: MultiSelectChipsProps<T>) {
  const selected = new Set(value)
  const atMax = max !== undefined && value.length >= max
  return (
    <ul
      data-component="MultiSelectChips"
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => {
        const on = selected.has(o.value)
        const disabled = !on && atMax
        return (
          <li key={o.value}>
            <button
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => {
                const next = new Set(value)
                if (on) next.delete(o.value)
                else next.add(o.value)
                onChange(Array.from(next) as T[])
              }}
              className={[
                'h-8 px-3 rounded-full text-xs leading-5 transition-colors',
                // Selected: solid brand red + white text + ring for stronger
                // visual lift; unselected: faint grey with hover affordance.
                on
                  ? 'bg-brand text-white font-medium ring-2 ring-brand/40 ring-offset-1'
                  : 'bg-black/5 text-ink-AA hover:bg-black/10',
                disabled && 'opacity-50 cursor-not-allowed',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {o.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
