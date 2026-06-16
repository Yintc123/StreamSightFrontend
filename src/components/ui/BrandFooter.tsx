type BrandFooterProps = {
  label?: string
}

export function BrandFooter({ label = '愛心沒有底線' }: BrandFooterProps) {
  return (
    <footer
      data-component="BrandFooter"
      aria-label="品牌標語"
      className="flex items-center justify-center gap-3 py-5 px-[15px]"
    >
      <span className="flex-1 h-px bg-black/20 max-w-[80px]" aria-hidden />
      <span className="text-[13px] leading-5 text-black/20 whitespace-nowrap">
        {label}
      </span>
      <span className="flex-1 h-px bg-black/20 max-w-[80px]" aria-hidden />
    </footer>
  )
}
