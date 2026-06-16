'use client'

/**
 * Spec 007 v0.2 §3 — shared between LoginCard and RegisterCard.
 *
 * Was inline inside LoginCard until spec 007 v0.2 extracted it; same
 * visual contract (label + 40-px input, 13/20 caption, brand focus
 * border) so the auth pages stay consistent without a layout shift.
 */
export function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  describedById,
}: {
  id: string
  label: string
  type: 'text' | 'password'
  autoComplete: string
  value: string
  onChange: (v: string) => void
  describedById?: string
}) {
  return (
    <label data-component="Field" htmlFor={id} className="flex flex-col gap-1">
      <span className="text-[13px] leading-5 text-ink-AA">{label}</span>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedById}
        className="h-10 px-3 rounded-lg bg-surface-card border border-line
                   text-sm text-ink-AAA placeholder:text-ink-A
                   focus:outline-none focus:border-brand"
      />
    </label>
  )
}
