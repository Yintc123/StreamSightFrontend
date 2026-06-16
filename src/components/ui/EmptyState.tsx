type EmptyStateProps = {
  illustration: string
  title: string
  subtitle?: string
}

export function EmptyState({ illustration, title, subtitle }: EmptyStateProps) {
  return (
    <div data-component="EmptyState" className="flex flex-col items-center gap-[18px] w-[319px] mx-auto mt-16">
      {/* spec 003a §4 明確允許 <img>；插畫已 144×144 不是 LCP 受益元素 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={illustration}
        alt=""
        width={144}
        height={144}
        className="w-36 h-36 object-contain"
      />
      <h2 className="text-xl font-medium leading-7 text-ink-AAA">{title}</h2>
      {subtitle && (
        <p className="text-sm leading-[22px] text-ink-A">{subtitle}</p>
      )}
    </div>
  )
}
