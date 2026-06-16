'use client'

type QtyStepperProps = {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
}

function MinusIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
    >
      <path d="M3 7h8" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
    >
      <path d="M3 7h8M7 3v8" />
    </svg>
  )
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: QtyStepperProps) {
  const buttonClass =
    'w-7 h-7 rounded-full border border-line flex items-center justify-center ' +
    'text-ink-AAA disabled:text-ink-A disabled:border-line/50 ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand'
  return (
    <div data-component="QtyStepper" className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="減少數量"
        className={buttonClass}
      >
        <MinusIcon />
      </button>
      <span className="text-sm text-ink-AAA tabular-nums min-w-[1.5em] text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="增加數量"
        className={buttonClass}
      >
        <PlusIcon />
      </button>
    </div>
  )
}
