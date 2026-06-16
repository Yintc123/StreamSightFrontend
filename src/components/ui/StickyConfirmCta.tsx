type StickyConfirmCtaProps = {
  label: string
  isValid: boolean
}

export function StickyConfirmCta({ label, isValid }: StickyConfirmCtaProps) {
  return (
    <div
      data-component="StickyConfirmCta"
      className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line
                 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-30"
    >
      <button
        type="submit"
        disabled={!isValid}
        className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                   disabled:bg-black/10 disabled:text-ink-A
                   focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {label}
      </button>
    </div>
  )
}
