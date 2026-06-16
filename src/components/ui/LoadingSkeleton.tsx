import type { ResourceKey } from '@/lib/schemas/list'

type LoadingSkeletonProps = {
  /** 對應卡片 shape；charity 是 row 排版、donation / item 是 column 排版 */
  variant: ResourceKey
  /** 渲染骨架卡片數量，預設 6 */
  count?: number
}

const CONTAINER_CLASS: Record<ResourceKey, string> = {
  charity: 'flex flex-col gap-3 px-[15px] pt-[15px]',
  donation: 'flex flex-col gap-3 px-[15px] pt-[15px]',
  item: 'grid grid-cols-2 gap-2 px-[15px] pt-[15px]',
}

export function LoadingSkeleton({ variant, count = 6 }: LoadingSkeletonProps) {
  const safeCount = Math.max(0, count)
  return (
    <div data-component="LoadingSkeleton" className={CONTAINER_CLASS[variant]} aria-hidden>
      {Array.from({ length: safeCount }).map((_, i) => {
        switch (variant) {
          case 'charity':
            return <CharityCardSkeleton key={i} />
          case 'donation':
            return <DonationCardSkeleton key={i} />
          case 'item':
            return <ItemCardSkeleton key={i} />
        }
      })}
    </div>
  )
}

function CharityCardSkeleton() {
  return (
    <div className="flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px] bg-surface-card rounded-xl">
      <div className="w-16 h-16 rounded-[9px] bg-line animate-pulse motion-reduce:animate-none shrink-0" />
      <div className="flex-1 flex flex-col gap-[3px] min-w-0">
        <div className="h-6 w-[60%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-5 w-[80%] rounded bg-line animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}

function DonationCardSkeleton() {
  return (
    <div className="flex flex-col w-full max-w-[345px] mx-auto bg-surface-card rounded-xl overflow-hidden">
      <div className="w-full aspect-[16/9] bg-line animate-pulse motion-reduce:animate-none" />
      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="h-4 w-[40%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-6 w-[80%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-5 w-full rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-6 w-[60%] rounded bg-line animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}

function ItemCardSkeleton() {
  // item variant 在 2 欄 grid 內，移除 mx-auto / max-w-[345px]（由 grid 控寬）
  return (
    <div className="flex flex-col w-full bg-surface-card rounded-xl overflow-hidden border border-line">
      <div className="w-full aspect-square bg-line animate-pulse motion-reduce:animate-none" />
      <div className="px-2 py-2 flex flex-col gap-1">
        <div className="h-[18px] w-[80%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-[18px] w-[50%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-4 w-[40%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-6 w-[45%] rounded bg-line animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}
